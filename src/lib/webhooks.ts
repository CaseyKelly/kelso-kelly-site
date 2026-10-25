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
 * Set up webhook for a Google Drive folder (photos or videos)
 * Drive webhooks expire after 24 hours
 */
export async function setupDriveWebhook(webhookUrl: string, folderId: string) {
  const channelId = `drive-${Date.now()}`;

  try {
    const result = await watchFolder(webhookUrl, channelId, folderId);

    // Store in database. If that fails, stop the watch we just created -
    // otherwise it stays live with no row, and the renewal cron's missing-folder
    // check would create a second watch on the same folder.
    try {
      await upsertWebhookChannel({
        channel_id: result.channelId,
        resource_type: 'drive',
        resource_id: result.resourceId,
        expiration: result.expiration,
        webhook_url: webhookUrl,
        folder_id: folderId,
      });
    } catch (dbError) {
      try {
        await stopWatchingFolder(result.channelId, result.resourceId);
      } catch (stopError) {
        console.warn(`Could not stop unpersisted Drive channel ${result.channelId}:`, stopError);
      }
      throw dbError;
    }

    console.log('Drive webhook set up:', result);
    return result;
  } catch (error) {
    console.error('Failed to set up drive webhook:', error);
    throw error;
  }
}

/**
 * The Drive folders that should always have an active webhook, based on env config.
 * Used by the Drive renewal cron to re-create any channel that has gone missing.
 */
export function getExpectedDriveWebhooks(baseUrl: string): { webhookUrl: string; folderId: string }[] {
  const expected: { webhookUrl: string; folderId: string }[] = [];

  if (process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID) {
    expected.push({
      webhookUrl: `${baseUrl}/api/webhook-drive`,
      folderId: process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID,
    });
  }

  if (process.env.GOOGLE_DRIVE_VIDEOS_FOLDER_ID) {
    expected.push({
      webhookUrl: `${baseUrl}/api/webhook-drive-videos`,
      folderId: process.env.GOOGLE_DRIVE_VIDEOS_FOLDER_ID,
    });
  }

  return expected;
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
          await stopWatchingCalendar(channel.channel_id, channel.resource_id);
        } catch (stopError) {
          console.warn(
            `Warning: Could not stop old ${channel.resource_type} channel, continuing with renewal...`,
            stopError
          );
        }

        // Set up new webhook FIRST (before deleting old record)
        // This ensures if setup fails, the old record exists for retry on next cron run
        const result = await setupCalendarWebhook(`${baseUrl}/api/webhook-calendar`);
        const newChannelId: string = result.channelId;

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
    drivePhotos: null as unknown,
    driveVideos: null as unknown,
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
    if (!process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID) {
      throw new Error('GOOGLE_DRIVE_PHOTOS_FOLDER_ID not configured');
    }
    results.drivePhotos = await setupDriveWebhook(
      `${baseUrl}/api/webhook-drive`,
      process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID
    );
  } catch (error) {
    console.error('Failed to set up drive photos webhook:', error);
    results.errors.push(`Drive photos: ${error}`);
  }

  if (process.env.GOOGLE_DRIVE_VIDEOS_FOLDER_ID) {
    try {
      results.driveVideos = await setupDriveWebhook(
        `${baseUrl}/api/webhook-drive-videos`,
        process.env.GOOGLE_DRIVE_VIDEOS_FOLDER_ID
      );
    } catch (error) {
      console.error('Failed to set up drive videos webhook:', error);
      results.errors.push(`Drive videos: ${error}`);
    }
  }

  return results;
}
