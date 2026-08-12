import { NextRequest, NextResponse } from 'next/server';
import { getWebhookChannels, deleteWebhookChannel } from '@/lib/db';
import { setupDriveWebhook } from '@/lib/webhooks';
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
    };

    console.log(`Found ${driveChannels.length} Drive webhook(s) to check`);

    for (const channel of driveChannels) {
      const timeUntil = channel.expiration - now;
      const hoursUntilExpiration = Math.round(timeUntil / 3600000);
      
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
          if (!channel.webhook_url || !channel.folder_id) {
            throw new Error(
              `Drive channel ${channel.channel_id} is missing webhook_url/folder_id (re-run /api/webhooks/setup)`
            );
          }
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

    const message = `Drive webhooks: ${results.renewed.length} renewed, ${results.failed.length} failed`;
    console.log(message);

    return NextResponse.json({
      success: results.failed.length === 0,
      renewed: results.renewed.length,
      failed: results.failed.length,
      message,
      details: {
        renewed: results.renewed,
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
