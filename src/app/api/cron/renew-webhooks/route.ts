import { NextRequest, NextResponse } from 'next/server';
import { renewWebhooks } from '@/lib/webhooks';
import { cleanupOldSyncLogs, getWebhookChannels, deleteWebhookChannel } from '@/lib/db';
import { sendWebhookAlert } from '@/lib/notifications';

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
    const channelsByType = new Map<string, typeof channels[0]>();
    const duplicatesToDelete: string[] = [];

    for (const channel of channels) {
      const existing = channelsByType.get(channel.resource_type);
      if (existing) {
        // Found duplicate - keep the one with later expiration
        if (channel.expiration > existing.expiration) {
          duplicatesToDelete.push(existing.channel_id);
          channelsByType.set(channel.resource_type, channel);
        } else {
          duplicatesToDelete.push(channel.channel_id);
        }
      } else {
        channelsByType.set(channel.resource_type, channel);
      }
    }

    // Clean up duplicates
    if (duplicatesToDelete.length > 0) {
      console.log(`Found ${duplicatesToDelete.length} duplicate webhooks, cleaning up...`);
      for (const channelId of duplicatesToDelete) {
        try {
          await deleteWebhookChannel(channelId);
          console.log(`Deleted duplicate channel: ${channelId}`);
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
    return NextResponse.json(
      { success: false, error: `${error}` },
      { status: 500 }
    );
  }
}
