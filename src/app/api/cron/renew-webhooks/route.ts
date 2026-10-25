import { NextRequest, NextResponse } from 'next/server';
import { renewWebhooks } from '@/lib/webhooks';
import { cleanupOldSyncLogs, getWebhookChannels, deleteWebhookChannel } from '@/lib/db';
import { sendWebhookAlert } from '@/lib/notifications';
import { stopWatchingCalendar } from '@/lib/google-calendar';
import { stopWatchingFolder } from '@/lib/google-drive';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/renew-webhooks
 * Cron job to renew expiring webhooks and clean up old sync logs
 * Runs daily via Vercel Cron
 */
export async function GET(request: NextRequest) {
  try {
    // Verify this is called by Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Running webhook renewal cron job...');

    // Detect and cleanup duplicates FIRST
    const channels = await getWebhookChannels();
    const channelsByResource = new Map<string, (typeof channels)[0]>();
    const duplicatesToDelete: string[] = [];

    for (const channel of channels) {
      // Drive channels watch different folders (photos, videos), so a duplicate
      // is the same type AND folder - keying on type alone deletes a valid watch.
      const key = `${channel.resource_type}:${channel.folder_id ?? ''}`;
      const existing = channelsByResource.get(key);
      if (existing) {
        // Found duplicate - keep the one with later expiration
        if (channel.expiration > existing.expiration) {
          duplicatesToDelete.push(existing.channel_id);
          channelsByResource.set(key, channel);
        } else {
          duplicatesToDelete.push(channel.channel_id);
        }
      } else {
        channelsByResource.set(key, channel);
      }
    }

    // Clean up duplicates
    if (duplicatesToDelete.length > 0) {
      console.log(`Found ${duplicatesToDelete.length} duplicate webhooks, cleaning up...`);

      for (const channelId of duplicatesToDelete) {
        try {
          // Find the full channel record to get resource_type and resource_id
          const duplicateChannel = channels.find((c) => c.channel_id === channelId);

          if (!duplicateChannel) {
            console.warn(`Channel ${channelId} not found in list, skipping stop`);
          } else {
            // Stop the webhook on Google's side FIRST
            try {
              if (duplicateChannel.resource_type === 'calendar') {
                await stopWatchingCalendar(duplicateChannel.channel_id, duplicateChannel.resource_id);
                console.log(`Stopped duplicate calendar channel: ${channelId}`);
              } else if (duplicateChannel.resource_type === 'drive') {
                await stopWatchingFolder(duplicateChannel.channel_id, duplicateChannel.resource_id);
                console.log(`Stopped duplicate drive channel: ${channelId}`);
              }
            } catch (stopError) {
              // Channel might already be expired (404), that's OK
              console.warn(`Could not stop channel ${channelId}:`, stopError);
            }
          }

          // Delete from database even if stop failed
          await deleteWebhookChannel(channelId);
          console.log(`Deleted duplicate channel from DB: ${channelId}`);
        } catch (error) {
          console.error(`Failed to delete duplicate ${channelId}:`, error);
        }
      }

      // Send alert about duplicates
      await sendWebhookAlert({
        type: 'duplicate_detected',
        message: `Detected and cleaned ${duplicatesToDelete.length} duplicate webhook channels`,
        details: { channels: duplicatesToDelete },
      });
    }

    // Get the base URL - use production domain consistently
    const baseUrl = 'https://kelso-kelly-site.vercel.app';

    const results = await renewWebhooks(baseUrl);

    console.log('Webhook renewal completed:', results);

    // Clean up old sync logs (keep last 30 days)
    const deletedCount = await cleanupOldSyncLogs(30);
    console.log(`Cleaned up ${deletedCount} old sync logs`);

    return NextResponse.json({
      success: true,
      renewed: results.renewed,
      failed: results.failed,
      duplicatesCleaned: duplicatesToDelete.length,
      syncLogsDeleted: deletedCount,
      message: `Renewed ${results.renewed.length} webhooks, ${results.failed.length} failed, ${duplicatesToDelete.length} duplicates cleaned, ${deletedCount} old sync logs removed`,
    });
  } catch (error) {
    console.error('Error in webhook renewal cron:', error);
    return NextResponse.json({ success: false, error: `${error}` }, { status: 500 });
  }
}
