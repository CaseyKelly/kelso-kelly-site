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
  getPhotos
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
    
    // Upsert all calendar events
    let upsertedCount = 0;
    for (const event of calendarEvents) {
      await upsertEvent({
        google_event_id: event.id,
        title: event.title,
        date: event.date,
        time: event.time,
        venue: event.venue,
        address: event.address,
        description: event.description,
        ticket_url: event.ticketUrl,
      });
      upsertedCount++;
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
    
    console.log(`Synced ${upsertedCount} events to database`);
    
    // Revalidate the schedule page
    revalidatePath('/schedule');
    
    await logSync({
      sync_type: 'calendar',
      status: 'success',
      message: `Synced ${upsertedCount} events`,
    });
    
    return {
      success: true,
      message: `Successfully synced ${upsertedCount} events from Google Calendar`,
      details: { count: upsertedCount },
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
 * Expects folder structure: parentFolderId/[category]/[images]
 * Categories: performance, backstage, press, promo
 */
export async function syncPhotos(): Promise<SyncResult> {
  try {
    console.log('Starting photo sync...');
    
    if (!process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID) {
      throw new Error('GOOGLE_DRIVE_PHOTOS_FOLDER_ID not configured');
    }
    
    const parentFolderId = process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID;
    const categories = ['performance', 'backstage', 'press', 'promo'] as const;
    
    let totalProcessed = 0;
    
    for (const category of categories) {
      console.log(`Processing ${category} photos...`);
      
      // Find the category folder
      const folderId = await findFolderByName(parentFolderId, category);
      
      if (!folderId) {
        console.log(`No ${category} folder found, skipping...`);
        continue;
      }
      
      // List all image files in the category folder
      const files = await listImageFilesInFolder(folderId);
      
      console.log(`Found ${files.length} images in ${category} folder`);
      
      // Get existing photos for this category to check what's new
      const existingPhotos = await getPhotos(category);
      const existingPhotoIds = new Set(existingPhotos.map(p => p.google_drive_id));
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Skip if already processed (unless we want to re-process)
        if (existingPhotoIds.has(file.id)) {
          console.log(`Skipping ${file.name} (already processed)`);
          continue;
        }
        
        try {
          console.log(`Processing ${file.name}...`);
          
          // Download the image
          const imageBuffer = await downloadFile(file.id);
          
          // Optimize the image
          const optimized = await optimizeImage(imageBuffer, {
            maxWidth: 1920,
            quality: 85,
            format: 'webp',
          });
          
          // Upload to Vercel Blob Storage
          const filename = `${category}/${file.id}.${optimized.format}`;
          const blob = await put(filename, optimized.buffer, {
            access: 'public',
            contentType: `image/${optimized.format}`,
          });
          
          // Generate title and alt text from filename
          const title = cleanFilenameForTitle(file.name);
          const altText = `${title} - ${category}`;
          
          // Save to database
          await upsertPhoto({
            google_drive_id: file.id,
            title,
            category,
            alt_text: altText,
            optimized_url: blob.url,
            width: optimized.width,
            height: optimized.height,
            order_index: i,
          });
          
          totalProcessed++;
          console.log(`Processed ${file.name} -> ${blob.url}`);
        } catch (error) {
          console.error(`Error processing ${file.name}:`, error);
          // Continue with next file
        }
      }
    }
    
    console.log(`Synced ${totalProcessed} new photos to database`);
    
    // Revalidate the media page
    revalidatePath('/media');
    
    await logSync({
      sync_type: 'photos',
      status: 'success',
      message: `Synced ${totalProcessed} photos`,
    });
    
    return {
      success: true,
      message: `Successfully synced ${totalProcessed} photos from Google Drive`,
      details: { count: totalProcessed },
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
    
    // Delete all existing videos and re-insert
    // This is simpler than trying to diff and update
    await deleteAllVideos();
    
    // Insert all videos
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
    
    console.log(`Synced ${sheetVideos.length} videos to database`);
    
    // Revalidate the media page
    revalidatePath('/media');
    
    await logSync({
      sync_type: 'videos',
      status: 'success',
      message: `Synced ${sheetVideos.length} videos`,
    });
    
    return {
      success: true,
      message: `Successfully synced ${sheetVideos.length} videos from Google Sheet`,
      details: { count: sheetVideos.length },
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
