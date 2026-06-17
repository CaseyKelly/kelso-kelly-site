import { watchCalendar, stopWatchingCalendar } from './google-calendar';
import { watchFolder, stopWatchingFolder } from './google-drive';
import { upsertWebhookChannel, getWebhookChannels, deleteWebhookChannel } from './db';

/**
 * Set up webhook for Google Calendar
 * Calendar webhooks expire after 7 days
 */
export async function setupCalendarWebhook(webhookUrl: string) {
  if (!process.env.GOOGLE_CALENDAR_ID) {
    throw new Error('GOOGLE_CALENDAR_ID not configured');
  }

  const channelId = `calendar-${Date.now()}`;
  
  try {
    const result = await watchCalendar(webhookUrl, channelId);
    
    // Store in database
    await upsertWebhookChannel({
      channel_id: result.channelId,
      resource_type: 'calendar',
      resource_id: result.resourceId,
      expiration: result.expiration,
    });
    
    console.log('Calendar webhook set up:', result);
    return result;
  } catch (error) {
    console.error('Failed to set up calendar webhook:', error);
    throw error;
  }
}

/**
 * Set up webhook for Google Drive photos folder
 * Drive webhooks expire after 24 hours
 */
export async function setupDriveWebhook(webhookUrl: string) {
  if (!process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID) {
    throw new Error('GOOGLE_DRIVE_PHOTOS_FOLDER_ID not configured');
  }

  const channelId = `drive-${Date.now()}`;
  const folderId = process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID;
  
  try {
    const result = await watchFolder(webhookUrl, channelId, folderId);
    
    // Store in database
    await upsertWebhookChannel({
      channel_id: result.channelId,
      resource_type: 'drive',
      resource_id: result.resourceId,
      expiration: result.expiration,
    });
    
    console.log('Drive webhook set up:', result);
    return result;
  } catch (error) {
    console.error('Failed to set up drive webhook:', error);
    throw error;
  }
}

/**
 * Renew all webhooks that are expiring soon
 * Should be called by a cron job
 * Skips Drive webhooks as they have a dedicated renewal cron
 */
export async function renewWebhooks(baseUrl: string) {
  const channels = await getWebhookChannels();
  const now = Date.now();
  const renewalThreshold = 24 * 60 * 60 * 1000; // 24 hours
  
  const results = {
    renewed: [] as string[],
    failed: [] as string[],
  };
  
  for (const channel of channels) {
    // Skip Drive webhooks - they're handled by dedicated cron every 12 hours
    if (channel.resource_type === 'drive') {
      console.log(`Skipping Drive webhook ${channel.channel_id} (handled by dedicated cron)`);
      continue;
    }
    
    const timeUntilExpiration = channel.expiration - now;
    
    // If expiring within threshold, renew
    if (timeUntilExpiration < renewalThreshold) {
      try {
        console.log(`Renewing ${channel.resource_type} webhook...`);
        
        // Stop old webhook (handles 404 gracefully if already expired)
        try {
          if (channel.resource_type === 'calendar') {
            await stopWatchingCalendar(channel.channel_id, channel.resource_id);
          } else if (channel.resource_type === 'drive') {
            await stopWatchingFolder(channel.channel_id, channel.resource_id);
          }
        } catch (stopError) {
          console.warn(`Warning: Could not stop old ${channel.resource_type} channel, continuing with renewal...`, stopError);
        }
        
        // Set up new webhook FIRST (before deleting old record)
        // This ensures if setup fails, the old record exists for retry on next cron run
        let newChannelId: string;
        if (channel.resource_type === 'calendar') {
          const result = await setupCalendarWebhook(`${baseUrl}/api/webhook-calendar`);
          newChannelId = result.channelId;
        } else if (channel.resource_type === 'drive') {
          const result = await setupDriveWebhook(`${baseUrl}/api/webhook-drive`);
          newChannelId = result.channelId;
        } else {
          throw new Error(`Unknown webhook resource type: ${channel.resource_type}`);
        }
        
        // Now that new webhook is created, delete old channel from database
        await deleteWebhookChannel(channel.channel_id);
        
        results.renewed.push(channel.channel_id);
        console.log(`Successfully renewed ${channel.resource_type} webhook (${channel.channel_id} -> ${newChannelId})`);
      } catch (error) {
        console.error(`Failed to renew ${channel.resource_type} webhook:`, error);
        results.failed.push(channel.channel_id);
      }
    }
  }
  
  return results;
}

/**
 * Clean up ALL existing webhooks
 * Stops watching all channels and removes them from the database
 */
export async function cleanupAllWebhooks() {
  const channels = await getWebhookChannels();
  const results = { stopped: 0, failed: 0, deleted: 0 };
  
  console.log(`Starting cleanup of ${channels.length} webhook channel(s)...`);
  
  for (const channel of channels) {
    try {
      if (channel.resource_type === 'calendar') {
        await stopWatchingCalendar(channel.channel_id, channel.resource_id);
      } else if (channel.resource_type === 'drive') {
        await stopWatchingFolder(channel.channel_id, channel.resource_id);
      }
      results.stopped++;
      console.log(`Stopped ${channel.resource_type} channel: ${channel.channel_id}`);
    } catch (error) {
      console.warn(`Failed to stop channel ${channel.channel_id}:`, error);
      results.failed++;
    }
    
    // Delete from database even if stop failed (channel might be already expired)
    try {
      await deleteWebhookChannel(channel.channel_id);
      results.deleted++;
      console.log(`Deleted channel from DB: ${channel.channel_id}`);
    } catch (dbError) {
      console.error(`Failed to delete channel ${channel.channel_id} from database:`, dbError);
      results.failed++;
      // Continue to next channel - don't let DB errors abort entire cleanup
    }
  }
  
  console.log('Cleanup completed:', results);
  return results;
}

/**
 * Initialize all webhooks (called once during setup)
 * Cleans up any existing webhooks first to prevent duplicates
 */
export async function initializeWebhooks(baseUrl: string) {
  // Clean up ALL existing webhooks first to prevent duplicates
  console.log('Cleaning up existing webhooks before setup...');
  const cleanup = await cleanupAllWebhooks();
  console.log(`Cleaned up ${cleanup.deleted} existing webhook(s)`);
  
  const results = {
    calendar: null as unknown,
    drive: null as unknown,
    cleanup,
    errors: [] as string[],
  };
  
  try {
    results.calendar = await setupCalendarWebhook(`${baseUrl}/api/webhook-calendar`);
  } catch (error) {
    console.error('Failed to set up calendar webhook:', error);
    results.errors.push(`Calendar: ${error}`);
  }
  
  try {
    results.drive = await setupDriveWebhook(`${baseUrl}/api/webhook-drive`);
  } catch (error) {
    console.error('Failed to set up drive webhook:', error);
    results.errors.push(`Drive: ${error}`);
  }
  
  return results;
}
