import { NextRequest, NextResponse } from 'next/server';
import { isKnownWebhookChannel } from '@/lib/db';
import { triggerYoutubeSyncWorkflow } from '@/lib/github-actions';
import { sendWebhookAlert } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const maxDuration = 15; // Only needs to fire a GitHub API call, not do the upload itself

/**
 * POST /api/webhook-drive-videos
 * Receives webhook notifications from Google Drive when the videos folder changes.
 *
 * Unlike /api/webhook-drive (photos), this does NOT sync in-request — it triggers
 * the sync-drive-videos-to-youtube GitHub Actions workflow, since Drive video
 * downloads + YouTube uploads can be slow/large enough to risk a function timeout.
 * The workflow's own 6-hour cron remains the fallback if this dispatch fails.
 */
export async function POST(request: NextRequest) {
  try {
    const resourceState = request.headers.get('x-goog-resource-state');
    const channelId = request.headers.get('x-goog-channel-id');
    const resourceId = request.headers.get('x-goog-resource-id');

    console.log('Drive videos webhook received:', { resourceState, channelId, resourceId });

    if (resourceState === 'sync') {
      return NextResponse.json({ received: true });
    }

    if (!channelId || !resourceId || !(await isKnownWebhookChannel(channelId, resourceId, 'drive'))) {
      console.warn('Drive videos webhook rejected: unknown channel', { channelId, resourceId });
      return NextResponse.json({ error: 'Unknown channel' }, { status: 403 });
    }

    if (resourceState === 'change' || resourceState === 'update' || resourceState === 'exists') {
      try {
        await triggerYoutubeSyncWorkflow();
        console.log('Triggered sync-drive-videos-to-youtube workflow');
        return NextResponse.json({ received: true, dispatched: true });
      } catch (error) {
        console.error('Failed to trigger YouTube sync workflow:', error);

        await sendWebhookAlert({
          type: 'renewal_failed',
          message: 'Drive videos webhook triggered but failed to dispatch the YouTube sync workflow',
          details: { error: String(error) },
        });

        // Still 200 so Google doesn't retry-storm us; the workflow's cron is the fallback
        return NextResponse.json({ received: true, dispatched: false, error: String(error) }, { status: 200 });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing drive videos webhook:', error);
    return NextResponse.json({ received: true, error: `${error}` });
  }
}

/**
 * GET /api/webhook-drive-videos
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/webhook-drive-videos',
    description: 'Google Drive webhook receiver for the videos folder (triggers YouTube upload workflow)',
    status: 'active',
  });
}
