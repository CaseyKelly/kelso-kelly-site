import { NextRequest, NextResponse } from 'next/server';
import { syncCalendarEvents } from '@/lib/sync';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhook-calendar
 * Receives webhook notifications from Google Calendar when events change
 * 
 * Google sends two types of notifications:
 * 1. Sync message (X-Goog-Resource-State: sync) - initial setup confirmation
 * 2. Change notification (X-Goog-Resource-State: exists/not_exists) - actual changes
 */
export async function POST(request: NextRequest) {
  try {
    const resourceState = request.headers.get('x-goog-resource-state');
    const channelId = request.headers.get('x-goog-channel-id');
    const resourceId = request.headers.get('x-goog-resource-id');
    
    console.log('Calendar webhook received:', {
      resourceState,
      channelId,
      resourceId,
    });
    
    // Sync message - just acknowledge
    if (resourceState === 'sync') {
      console.log('Calendar webhook sync message received');
      return NextResponse.json({ received: true });
    }
    
    // Actual change notification - trigger sync
    if (resourceState === 'exists' || resourceState === 'not_exists') {
      console.log('Calendar changed, triggering sync...');
      
      // Trigger sync asynchronously (don't wait for it)
      syncCalendarEvents()
        .then(result => {
          console.log('Calendar sync completed:', result);
        })
        .catch(error => {
          console.error('Calendar sync failed:', error);
        });
      
      // Acknowledge immediately
      return NextResponse.json({ received: true, syncing: true });
    }
    
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing calendar webhook:', error);
    // Still return 200 to acknowledge receipt
    return NextResponse.json({ received: true, error: `${error}` });
  }
}

/**
 * GET /api/webhook-calendar
 * Health check endpoint
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/api/webhook-calendar',
    description: 'Google Calendar webhook receiver',
    status: 'active',
  });
}
