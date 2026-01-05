import { NextRequest, NextResponse } from 'next/server';
import { syncPhotos } from '@/lib/sync';

export const dynamic = 'force-dynamic';

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
      
      // Trigger sync asynchronously (don't wait for it)
      syncPhotos()
        .then(result => {
          console.log('Photo sync completed:', result);
        })
        .catch(error => {
          console.error('Photo sync failed:', error);
        });
      
      // Acknowledge immediately
      return NextResponse.json({ received: true, syncing: true });
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
