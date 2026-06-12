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
 * Initialize all webhooks (called once during setup)
 */
export async function initializeWebhooks(baseUrl: string) {
  const results = {
    calendar: null as any,
    drive: null as any,
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
