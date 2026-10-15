import { fetchAllCalendarEvents } from './google-calendar';
import {
  listImageFilesInFolder,
  downloadFile,
  cleanFilenameForTitle,
} from './google-drive';
import { fetchVideosFromSheetWithThumbnails } from './google-sheets';
import {
  sql,
  upsertEvent,
  upsertPhoto,
  updatePhotosMetadata,
  upsertVideo,
  deletePhoto,
  deleteEvent,
  logSync,
  getEventIds,
  getPhotoImageDataByDriveId,
  getVideoUrls,
  type DbPhoto,
} from './db';
import { put, del } from '@vercel/blob';
import { revalidatePath } from 'next/cache';
import { shouldSync } from './sync-throttle';

export interface SyncResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Sync events from Google Calendar to database
 * @param force - If true, bypass throttling (used by webhooks)
 */
export async function syncCalendarEvents(force = false): Promise<SyncResult> {
  // Throttle: Don't sync if synced within last 2 minutes (unless forced)
  if (!force && !(await shouldSync('calendar', 2 * 60 * 1000))) {
    return {
      success: true,
      message: 'Calendar sync throttled (recent sync)',
      details: { throttled: true },
    };
  }

  try {
    console.log('Starting calendar sync...');

    // Fetch all events from Google Calendar
    const calendarEvents = await fetchAllCalendarEvents();

    console.log(`Found ${calendarEvents.length} events in Google Calendar`);

    // Get existing event IDs from database (optimized query)
    const existingEventIds = await getEventIds();
    const calendarEventIds = new Set(calendarEvents.map(e => e.id));
    
    // Upsert all calendar events and track changes
    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    let deletedCount = 0;
    
    for (const event of calendarEvents) {
      const result = await upsertEvent({
        google_event_id: event.id,
        title: event.title,
        date: event.date,
        time: event.time,
        venue: event.venue,
        address: event.address,
        description: event.description,
        ticket_url: event.ticketUrl,
      });
      
      if (result.action === 'created') {
        createdCount++;
        console.log(`✓ Created event: ${event.title}`);
      } else if (result.action === 'updated') {
        updatedCount++;
        console.log(`✓ Updated event: ${event.title}`);
      } else {
        unchangedCount++;
      }
    }
    
    // Delete events that were removed from calendar with safety guard
    const deletedEventIds = [...existingEventIds].filter(id => !calendarEventIds.has(id));
    let deletionSkipped = false;
    
    if (deletedEventIds.length > 0) {
      const deletionPercentage = (deletedEventIds.length / existingEventIds.size) * 100;
      const percentageThreshold = 20; // Warn if >20% of events would be deleted
      const minimumCountThreshold = 5; // Only guard if ≥5 events AND >20%
      
      // Hybrid threshold: protect against bulk deletions (high count + high percentage)
      // Allow small cleanups even if percentage is high (e.g., 1 of 1 event = 100%)
      const shouldGuard = deletedEventIds.length >= minimumCountThreshold && 
                          deletionPercentage > percentageThreshold;
      
      if (shouldGuard) {
        console.warn(
          `⚠️  Deletion safety threshold exceeded: ${deletedEventIds.length} events (${deletionPercentage.toFixed(1)}%) ` +
          `would be deleted. This might indicate a sync or pagination issue. Skipping deletion to prevent data loss.`
        );
        deletionSkipped = true;
      } else {
        // Safe to delete
        for (const eventId of deletedEventIds) {
          await deleteEvent(eventId);
          deletedCount++;
          console.log(`✓ Deleted event: ${eventId}`);
        }
      }
    }
    
    let summary = `Created: ${createdCount}, Updated: ${updatedCount}, Unchanged: ${unchangedCount}, Deleted: ${deletedCount}`;
    if (deletionSkipped) {
      summary += ` (${deletedEventIds.length} deletions skipped - safety threshold)`;
    }
    console.log(`Calendar sync complete - ${summary}`);

    // Revalidate the schedule page
    revalidatePath('/schedule');

    await logSync({
      sync_type: 'calendar',
      status: 'success',
      message: summary,
    });

    return {
      success: true,
      message: `Successfully synced ${calendarEvents.length} events from Google Calendar`,
      details: {
        total: calendarEvents.length,
        created: createdCount,
        updated: updatedCount,
        unchanged: unchangedCount,
        deleted: deletedCount,
      },
    };
  } catch (error) {
    console.error('Error syncing calendar events:', error);

    await logSync({
      sync_type: 'calendar',
      status: 'error',
      message: `${error}`,
    });

    return {
      success: false,
      message: `Failed to sync calendar events: ${error}`,
    };
  }
}

/**
 * Sync photos from Google Drive to database
 * Looks for photos directly in the main folder
 * All photos will be assigned the 'performance' category by default
 * @param force - If true, bypass throttling (used by webhooks)
 */
export async function syncPhotos(force = false): Promise<SyncResult> {
  // Throttle: Don't sync if synced within last 5 minutes (unless forced)
  if (!force && !(await shouldSync('photos', 5 * 60 * 1000))) {
    return {
      success: true,
      message: 'Photo sync throttled (recent sync)',
      details: { throttled: true },
    };
  }

  try {
    console.log('Starting photo sync...');

    if (!process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID) {
      throw new Error('GOOGLE_DRIVE_PHOTOS_FOLDER_ID not configured');
    }

    // Loaded lazily so routes that only sync calendar/video data never pull
    // in sharp (and its native libvips binary) into their function bundle.
    const { optimizeImage, isHeicFile, UnsupportedFormatError } = await import('./image-optimizer');

    const folderId = process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID;
    const defaultCategory: DbPhoto['category'] = 'performance';

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let deletedCount = 0;
    let errorCount = 0;
    let heicSkippedCount = 0;

    console.log('Fetching images from Google Drive...');
    console.log('Folder ID:', folderId);

    // List all image files in the main folder
    let files;
    try {
      const fetchStartTime = Date.now();
      files = await listImageFilesInFolder(folderId);
      const fetchDuration = Date.now() - fetchStartTime;
      console.log(`Fetched ${files.length} files from Drive in ${fetchDuration}ms`);
    } catch (error) {
      console.error('Failed to fetch images from Google Drive:', error);
      throw new Error(`Drive API error: ${error}`);
    }

    console.log(`Found ${files.length} images in Drive folder`);
    console.log('Files:', files.map(f => ({ id: f.id, name: f.name })));

    // Load existing photos' image data in a single query (avoids an N+1 lookup per file)
    const existingPhotos = await getPhotoImageDataByDriveId();
    console.log(`Found ${existingPhotos.size} existing photos in database`);
    
    // Create a Set of Drive file IDs for efficient lookup
    const driveFileIds = new Set(files.map(f => f.id));

    // Existing photos only need their metadata refreshed (image data is kept),
    // so update them all in one query instead of an upsert per photo (N+1)
    const existingFileUpdates = files.flatMap((file, i) => {
      if (!existingPhotos.has(file.id)) return [];
      const title = cleanFilenameForTitle(file.name);
      return [{
        google_drive_id: file.id,
        title,
        category: defaultCategory,
        alt_text: title,
        order_index: i,
      }];
    });

    try {
      const updatedIds = await updatePhotosMetadata(existingFileUpdates);
      updatedCount += updatedIds.size;
      skippedCount += existingFileUpdates.length - updatedIds.size;
      for (const file of files) {
        if (updatedIds.has(file.id)) {
          console.log(`✓ Updated metadata: ${file.name}`);
        }
      }
    } catch (error) {
      errorCount += existingFileUpdates.length;
      console.error('✗ Error updating existing photo metadata:', error);
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (existingPhotos.has(file.id)) continue;

      try {
        
        // Check if this is a HEIC file (unsupported format)
        if (isHeicFile(file.name, file.mimeType)) {
          console.log(`⚠️  Skipping HEIC file (unsupported format): ${file.name}`);
          heicSkippedCount++;
          continue;
        }
        
        // New photo - download, optimize, and upload
        console.log(`Processing new photo: ${file.name}...`);
        
        // Download the image
        const imageBuffer = await downloadFile(file.id);
        
        // Optimize the image (with metadata for better error messages)
        const optimized = await optimizeImage(imageBuffer, {
          maxWidth: 1920,
          quality: 85,
          format: 'webp',
        }, {
          filename: file.name,
          mimeType: file.mimeType,
        });
        
        // Upload to Vercel Blob Storage
        const filename = `photos/${file.id}.${optimized.format}`;
        const blob = await put(filename, optimized.buffer, {
          access: 'public',
          contentType: `image/${optimized.format}`,
        });
        
        // Generate title and alt text from filename
        const title = cleanFilenameForTitle(file.name);
        const altText = title;
        
        // Save to database
        const result = await upsertPhoto({
          google_drive_id: file.id,
          title,
          category: defaultCategory,
          alt_text: altText,
          optimized_url: blob.url,
          width: optimized.width,
          height: optimized.height,
          order_index: i,
        });
        
        if (result.action === 'created') {
          createdCount++;
          console.log(`✓ Created photo: ${file.name}`);
        } else if (result.action === 'updated') {
          updatedCount++;
          console.log(`✓ Updated photo: ${file.name}`);
        }
      } catch (error) {
        // Categorize errors: unsupported formats vs actual processing errors
        if (error instanceof UnsupportedFormatError) {
          console.warn(`⚠️  Unsupported format, skipping ${file.name}:`, error.message);
          heicSkippedCount++;
          // Don't increment errorCount - this is expected behavior for unsupported formats
        } else {
          errorCount++;
          console.error(`✗ Error processing ${file.name}:`, error);
        }
        // Continue with next file regardless
      }
    }
    
    // Delete photos that exist in database but not in Drive
    console.log('Checking for photos to delete...');
    for (const dbPhotoId of existingPhotos.keys()) {
      if (!driveFileIds.has(dbPhotoId)) {
        try {
          console.log(`Deleting photo no longer in Drive: ${dbPhotoId}`);
          await deletePhoto(dbPhotoId);
          deletedCount++;
          console.log(`✓ Deleted photo: ${dbPhotoId}`);

          // Remove the optimized image from Blob storage too, otherwise it stays
          // publicly reachable forever. A failure here shouldn't fail the sync.
          const blobUrl = existingPhotos.get(dbPhotoId)?.optimized_url;
          if (blobUrl) {
            try {
              await del(blobUrl);
            } catch (blobError) {
              console.warn(`Could not delete blob for photo ${dbPhotoId}:`, blobError);
            }
          }
        } catch (error) {
          errorCount++;
          console.error(`✗ Error deleting photo ${dbPhotoId}:`, error);
        }
      }
    }
    
    // Build detailed summary message
    const summaryParts = [
      `Created: ${createdCount}`,
      `Updated: ${updatedCount}`,
      `Skipped: ${skippedCount}`,
      `Deleted: ${deletedCount}`,
      `Errors: ${errorCount}`,
    ];

    if (heicSkippedCount > 0) {
      summaryParts.push(`HEIC Skipped: ${heicSkippedCount}`);
    }

    const summary = summaryParts.join(', ');
    console.log(`Photo sync complete - ${summary}`);

    // Add helpful message if HEIC files were skipped
    if (heicSkippedCount > 0) {
      console.log(`ℹ️  Note: ${heicSkippedCount} HEIC file(s) were skipped. HEIC format is not supported. Please convert to JPEG or PNG before uploading.`);
    }

    // Revalidate the media page
    revalidatePath('/media');

    await logSync({
      sync_type: 'photos',
      status: errorCount > 0 ? 'error' : 'success',
      message: summary,
    });

    return {
      success: errorCount === 0, // Only fail on actual errors, not unsupported formats
      message: `Photo sync complete - ${summary}`,
      details: {
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
        deleted: deletedCount,
        errors: errorCount,
        heicSkipped: heicSkippedCount,
      },
    };
  } catch (error) {
    console.error('Error syncing photos:', error);

    await logSync({
      sync_type: 'photos',
      status: 'error',
      message: `${error}`,
    });

    return {
      success: false,
      message: `Failed to sync photos: ${error}`,
    };
  }
}

/**
 * Sync videos from Google Sheet to database
 * @param force - If true, bypass throttling (used by webhooks)
 */
export async function syncVideos(force = false): Promise<SyncResult> {
  // Throttle: Don't sync if synced within last 3 minutes (unless forced)
  if (!force && !(await shouldSync('videos', 3 * 60 * 1000))) {
    return {
      success: true,
      message: 'Video sync throttled (recent sync)',
      details: { throttled: true },
    };
  }

  try {
    console.log('Starting video sync...');

    if (!process.env.GOOGLE_VIDEOS_SHEET_ID) {
      throw new Error('GOOGLE_VIDEOS_SHEET_ID not configured');
    }

    // Fetch videos from Google Sheet
    const sheetVideos = await fetchVideosFromSheetWithThumbnails(
      process.env.GOOGLE_VIDEOS_SHEET_ID
    );

    console.log(`Found ${sheetVideos.length} videos in Google Sheet`);

    // Get existing video URLs (optimized query) - don't fetch full data yet
    const existingVideoUrls = await getVideoUrls();

    // Upsert all videos and track changes
    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    console.log(`Upserting ${sheetVideos.length} videos from sheet...`);
    for (const video of sheetVideos) {
      try {
        const result = await upsertVideo({
          title: video.title,
          youtube_url: video.youtubeUrl,
          thumbnail_url: video.thumbnailUrl,
          description: video.description,
          category: video.category,
          order_index: video.orderIndex,
        });

        if (result.action === 'created') {
          createdCount++;
          console.log(`✓ Created video: ${video.title}`);
        } else if (result.action === 'updated') {
          updatedCount++;
          console.log(`✓ Updated video: ${video.title}`);
        } else {
          unchangedCount++;
        }
      } catch (error) {
        console.error(`✗ Error upserting video "${video.title}":`, error);
        throw error; // Re-throw to fail the sync
      }
    }

    // Delete videos not in the sheet using targeted deletion (avoid fetching full data)
    const sheetVideoUrls = new Set(sheetVideos.map(v => v.youtubeUrl));
    const urlsToDelete = [...existingVideoUrls].filter(url => !sheetVideoUrls.has(url));

    for (const url of urlsToDelete) {
      await sql`DELETE FROM videos WHERE youtube_url = ${url}`;
      console.log(`✓ Deleted video with URL: ${url}`);
    }

    const summary = `Created: ${createdCount}, Updated: ${updatedCount}, Unchanged: ${unchangedCount}, Deleted: ${urlsToDelete.length}`;
    console.log(`Video sync complete - ${summary}`);

    // Revalidate the media page
    revalidatePath('/media');

    await logSync({
      sync_type: 'videos',
      status: 'success',
      message: summary,
    });

    return {
      success: true,
      message: `Successfully synced ${sheetVideos.length} videos from Google Sheet`,
      details: {
        total: sheetVideos.length,
        created: createdCount,
        updated: updatedCount,
        unchanged: unchangedCount,
        deleted: urlsToDelete.length,
      },
    };
  } catch (error) {
    console.error('Error syncing videos:', error);

    await logSync({
      sync_type: 'videos',
      status: 'error',
      message: `${error}`,
    });

    return {
      success: false,
      message: `Failed to sync videos: ${error}`,
    };
  }
}

/**
 * Sync everything (calendar, photos, videos)
 */
export async function syncAll(): Promise<{
  calendar: SyncResult;
  photos: SyncResult;
  videos: SyncResult;
}> {
  console.log('Starting full sync...');
  
  const results = {
    calendar: await syncCalendarEvents(),
    photos: await syncPhotos(),
    videos: await syncVideos(),
  };
  
  console.log('Full sync completed');
  
  return results;
}
