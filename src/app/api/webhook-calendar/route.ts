import { NextRequest, NextResponse } from 'next/server';
import { syncCalendarEvents } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for calendar sync to complete

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
      console.log('Webhook will wait for sync to complete before responding');

      try {
        // Wait for sync to complete before responding (force=true bypasses throttling)
        const syncStartTime = Date.now();
        const result = await syncCalendarEvents(true);
        const syncDuration = Date.now() - syncStartTime;
        
        console.log(`Calendar sync completed in ${syncDuration}ms:`, result);
        
        if (result.success) {
          return NextResponse.json({ 
            received: true, 
            synced: true,
            result: result.message,
            details: result.details,
            duration: syncDuration
          });
        } else {
          console.error('Calendar sync failed:', result.message);
          return NextResponse.json({ 
            received: true, 
            synced: false,
            error: result.message 
          }, { status: 200 }); // Still return 200 to prevent Google retries
        }
      } catch (error) {
        console.error('Calendar sync threw an error:', error);
        return NextResponse.json({ 
          received: true, 
          synced: false,
          error: `Sync failed: ${error}` 
        }, { status: 200 }); // Still return 200 to prevent Google retries
      }
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
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    endpoint: '/api/webhook-calendar',
    description: 'Google Calendar webhook receiver',
    status: 'active',
  });
}
