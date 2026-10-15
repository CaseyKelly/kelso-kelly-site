import { NextRequest, NextResponse } from 'next/server';
import { getWebhookChannels, deleteWebhookChannel } from '@/lib/db';
import { setupDriveWebhook, getExpectedDriveWebhooks } from '@/lib/webhooks';
import { stopWatchingFolder } from '@/lib/google-drive';
import { sendWebhookAlert } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/renew-drive-webhooks
 * Specialized cron for Drive webhooks that expire in 24h
 * Runs every 12 hours for safer renewal margin
 */
export async function GET(request: NextRequest) {
  try {
    // Verify Vercel Cron authentication
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Running Drive webhook renewal cron...');
    const channels = await getWebhookChannels();
    const now = Date.now();
    const renewalThreshold = 18 * 60 * 60 * 1000; // 18 hours (75% of 24h lifespan)
    
    const driveChannels = channels.filter(c => c.resource_type === 'drive');
    const results = {
      renewed: [] as string[],
      failed: [] as string[],
      created: [] as string[],
    };

    // Folders that still have a channel after this run (renewed, still valid, or
    // failed renewal whose old record is kept for retry). Anything expected but
    // not in here gets a fresh webhook below.
    const coveredFolderIds = new Set<string>();

    console.log(`Found ${driveChannels.length} Drive webhook(s) to check`);

    for (const channel of driveChannels) {
      const timeUntil = channel.expiration - now;
      const hoursUntilExpiration = Math.round(timeUntil / 3600000);
      
      // Legacy channel with no folder recorded - it can't be renewed in place,
      // so retire it and let the missing-folder check below re-create it.
      if (!channel.webhook_url || !channel.folder_id) {
        console.warn(`Drive channel ${channel.channel_id} is missing webhook_url/folder_id, replacing it`);
        try {
          await stopWatchingFolder(channel.channel_id, channel.resource_id);
        } catch (error) {
          console.warn('Could not stop legacy channel (may already be expired):', error);
        }
        await deleteWebhookChannel(channel.channel_id);
        continue;
      }

      coveredFolderIds.add(channel.folder_id);

      if (timeUntil < renewalThreshold) {
        try {
          console.log(`Renewing Drive webhook ${channel.channel_id} (expires in ${hoursUntilExpiration}h)`);
          
          // Stop old webhook (handles 404 gracefully)
          try {
            await stopWatchingFolder(channel.channel_id, channel.resource_id);
            console.log(`Stopped old Drive channel: ${channel.channel_id}`);
          } catch (error) {
            console.warn('Could not stop old channel (may already be expired):', error);
          }
          
          // Create new webhook, re-watching the same folder via the same route
          const result = await setupDriveWebhook(channel.webhook_url, channel.folder_id);
          console.log(`Created new Drive webhook: ${result.channelId}`);
          
          // Delete old record from database
          await deleteWebhookChannel(channel.channel_id);
          
          results.renewed.push(channel.channel_id);
          console.log(`✓ Successfully renewed Drive webhook: ${channel.channel_id} → ${result.channelId}`);
        } catch (error) {
          console.error('Failed to renew Drive webhook:', error);
          results.failed.push(channel.channel_id);
          
          // Send alert on failure
          await sendWebhookAlert({
            type: 'renewal_failed',
            message: `Failed to renew Drive webhook ${channel.channel_id}`,
            details: { error: String(error), channel },
          });
        }
      } else {
        console.log(`Drive webhook ${channel.channel_id} still has ${hoursUntilExpiration}h remaining, no renewal needed`);
      }
    }

    // Self-heal: re-create a webhook for any configured folder with no channel,
    // e.g. after a lost record or a partially failed /api/webhooks/setup run.
    // Without this, a missing channel is never renewed and that folder silently
    // falls back to the slow sync cron.
    const baseUrl = 'https://kelso-kelly-site.vercel.app';
    for (const expected of getExpectedDriveWebhooks(baseUrl)) {
      if (coveredFolderIds.has(expected.folderId)) continue;

      try {
        console.log(`No Drive webhook found for folder ${expected.folderId}, creating one (${expected.webhookUrl})`);
        const result = await setupDriveWebhook(expected.webhookUrl, expected.folderId);
        results.created.push(result.channelId);
        console.log(`✓ Created missing Drive webhook: ${result.channelId}`);
      } catch (error) {
        console.error(`Failed to create missing Drive webhook for folder ${expected.folderId}:`, error);
        results.failed.push(expected.folderId);

        await sendWebhookAlert({
          type: 'renewal_failed',
          message: `Failed to create missing Drive webhook for folder ${expected.folderId}`,
          details: { error: String(error), webhookUrl: expected.webhookUrl },
        });
      }
    }

    const message = `Drive webhooks: ${results.renewed.length} renewed, ${results.created.length} created, ${results.failed.length} failed`;
    console.log(message);

    return NextResponse.json({
      success: results.failed.length === 0,
      renewed: results.renewed.length,
      created: results.created.length,
      failed: results.failed.length,
      message,
      details: {
        renewed: results.renewed,
        created: results.created,
        failed: results.failed,
      },
    });
  } catch (error) {
    console.error('Error in Drive webhook renewal:', error);
    
    // Send alert about cron failure
    await sendWebhookAlert({
      type: 'renewal_failed',
      message: 'Drive webhook renewal cron failed',
      details: { error: String(error) },
    });
    
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
