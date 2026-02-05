import { NextRequest, NextResponse } from 'next/server';
import { syncPhotos } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for photo sync to complete

/**
 * POST /api/webhook-drive
 * Receives webhook notifications from Google Drive when folder contents change
 * 
 * Google sends notifications for file changes in the watched folder
 */
export async function POST(request: NextRequest) {
  try {
    const resourceState = request.headers.get('x-goog-resource-state');
    const channelId = request.headers.get('x-goog-channel-id');
    const resourceId = request.headers.get('x-goog-resource-id');
    const changedField = request.headers.get('x-goog-changed');
    
    console.log('Drive webhook received:', {
      resourceState,
      channelId,
      resourceId,
      changedField,
    });
    
    // Sync message - just acknowledge
    if (resourceState === 'sync') {
      console.log('Drive webhook sync message received');
      return NextResponse.json({ received: true });
    }
    
    // Change notification - trigger photo sync
    if (resourceState === 'change' || resourceState === 'update' || resourceState === 'exists') {
      console.log('Drive folder changed, triggering photo sync...');
      console.log('Webhook will wait for sync to complete before responding');

      try {
        // Wait for sync to complete before responding (force=true bypasses throttling)
        const syncStartTime = Date.now();
        const result = await syncPhotos(true);
        const syncDuration = Date.now() - syncStartTime;
        
        console.log(`Photo sync completed in ${syncDuration}ms:`, result);
        
        if (result.success) {
          return NextResponse.json({ 
            received: true, 
            synced: true,
            result: result.message,
            details: result.details,
            duration: syncDuration
          });
        } else {
          console.error('Photo sync failed:', result.message);
          return NextResponse.json({ 
            received: true, 
            synced: false,
            error: result.message 
          }, { status: 200 }); // Still return 200 to prevent Google retries
        }
      } catch (error) {
        console.error('Photo sync threw an error:', error);
        return NextResponse.json({ 
          received: true, 
          synced: false,
          error: `Sync failed: ${error}` 
        }, { status: 200 }); // Still return 200 to prevent Google retries
      }
    }
    
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing drive webhook:', error);
    // Still return 200 to acknowledge receipt
    return NextResponse.json({ received: true, error: `${error}` });
  }
}

/**
 * GET /api/webhook-drive
 * Health check endpoint
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/api/webhook-drive',
    description: 'Google Drive webhook receiver',
    status: 'active',
  });
}
