import { fetchAllCalendarEvents } from './google-calendar';
import { 
  listImageFilesInFolder, 
  downloadFile, 
  getCategoryFromFolderName, 
  cleanFilenameForTitle,
  findFolderByName
} from './google-drive';
import { fetchVideosFromSheetWithThumbnails } from './google-sheets';
import { optimizeImage } from './image-optimizer';
import { 
  upsertEvent, 
  upsertPhoto, 
  upsertVideo, 
  deleteAllVideos,
  logSync,
  getEvents,
  getPhotos,
  getVideos
} from './db';
import { put } from '@vercel/blob';
import { revalidatePath } from 'next/cache';

export interface SyncResult {
  success: boolean;
  message: string;
  details?: any;
}

/**
 * Sync events from Google Calendar to database
 */
export async function syncCalendarEvents(): Promise<SyncResult> {
  try {
    console.log('Starting calendar sync...');
    
    // Fetch all events from Google Calendar
    const calendarEvents = await fetchAllCalendarEvents();
    
    console.log(`Found ${calendarEvents.length} events in Google Calendar`);
    
    // Get existing events from database to check for deletions
    const existingEvents = await getEvents();
    const existingEventIds = new Set(existingEvents.map(e => e.google_event_id));
    const calendarEventIds = new Set(calendarEvents.map(e => e.id));
    
    // Upsert all calendar events and track changes
    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    
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
    
    // Note: We're not auto-deleting events that were removed from calendar
    // This is intentional to preserve historical data
    // If you want to delete removed events, uncomment the code below:
    /*
    const deletedEventIds = [...existingEventIds].filter(id => !calendarEventIds.has(id));
    for (const eventId of deletedEventIds) {
      await deleteEvent(eventId);
    }
    */
    
    const summary = `Created: ${createdCount}, Updated: ${updatedCount}, Unchanged: ${unchangedCount}`;
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
 */
export async function syncPhotos(): Promise<SyncResult> {
  try {
    console.log('Starting photo sync...');
    
    if (!process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID) {
      throw new Error('GOOGLE_DRIVE_PHOTOS_FOLDER_ID not configured');
    }
    
    const folderId = process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID;
    const defaultCategory = 'performance';
    
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    console.log('Fetching images from Google Drive...');
    console.log('Folder ID:', folderId);
    
    // List all image files in the main folder
    const files = await listImageFilesInFolder(folderId);
    
    console.log(`Found ${files.length} images in Drive folder`);
    console.log('Files:', files.map(f => ({ id: f.id, name: f.name })));
    
    // Get existing photos from database
    const existingPhotos = await getPhotos();
    console.log(`Found ${existingPhotos.length} existing photos in database`);
    const existingPhotoIds = new Set(existingPhotos.map(p => p.google_drive_id));
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        // Check if photo already exists
        const photoExists = existingPhotoIds.has(file.id);
        
        if (photoExists) {
          // Photo exists - only update metadata (skip expensive download/optimize)
          const existingPhoto = existingPhotos.find(p => p.google_drive_id === file.id)!;
          const title = cleanFilenameForTitle(file.name);
          const altText = `${title} - Kelso Kelly`;
          
          const result = await upsertPhoto({
            google_drive_id: file.id,
            title,
            category: defaultCategory,
            alt_text: altText,
            optimized_url: existingPhoto.optimized_url, // Keep existing
            width: existingPhoto.width, // Keep existing
            height: existingPhoto.height, // Keep existing
            order_index: i,
          });
          
          if (result.action === 'updated') {
            updatedCount++;
            console.log(`✓ Updated metadata: ${file.name}`);
          } else {
            skippedCount++;
          }
          continue;
        }
        
        // New photo - download, optimize, and upload
        console.log(`Processing new photo: ${file.name}...`);
        
        // Download the image
        const imageBuffer = await downloadFile(file.id);
        
        // Optimize the image
        const optimized = await optimizeImage(imageBuffer, {
          maxWidth: 1920,
          quality: 85,
          format: 'webp',
        });
        
        // Upload to Vercel Blob Storage
        const filename = `photos/${file.id}.${optimized.format}`;
        const blob = await put(filename, optimized.buffer, {
          access: 'public',
          contentType: `image/${optimized.format}`,
        });
        
        // Generate title and alt text from filename
        const title = cleanFilenameForTitle(file.name);
        const altText = `${title} - Kelso Kelly`;
        
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
        errorCount++;
        console.error(`✗ Error processing ${file.name}:`, error);
        // Continue with next file
      }
    }
    
    const summary = `Created: ${createdCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`;
    console.log(`Photo sync complete - ${summary}`);
    
    // Revalidate the media page
    revalidatePath('/media');
    
    await logSync({
      sync_type: 'photos',
      status: errorCount > 0 ? 'error' : 'success',
      message: summary,
    });
    
    return {
      success: errorCount === 0,
      message: `Photo sync complete - ${summary}`,
      details: { 
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errorCount,
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
 */
export async function syncVideos(): Promise<SyncResult> {
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
    
    // Get existing videos for comparison
    const existingVideos = await getVideos();
    
    // Delete all existing videos and re-insert
    // This is simpler than trying to diff and update
    console.log(`Deleting ${existingVideos.length} existing videos...`);
    await deleteAllVideos();
    
    // Insert all videos
    console.log(`Inserting ${sheetVideos.length} videos from sheet...`);
    for (const video of sheetVideos) {
      await upsertVideo({
        title: video.title,
        youtube_url: video.youtubeUrl,
        thumbnail_url: video.thumbnailUrl,
        description: video.description,
        category: video.category,
        order_index: video.orderIndex,
      });
    }
    
    const summary = `Replaced ${existingVideos.length} videos with ${sheetVideos.length} from sheet`;
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
        previous: existingVideos.length,
        current: sheetVideos.length,
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
