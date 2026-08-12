import { NextRequest, NextResponse } from 'next/server';
import { syncPhotos } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max execution time (photos can take longer)

/**
 * POST /api/sync-photos
 * Manually trigger a photo sync from Google Drive
 */
export async function POST(_request: NextRequest) {
  try {
    // Optional: Add authentication here
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.SYNC_API_SECRET}`) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    console.log('Manual photo sync triggered');
    
    const result = await syncPhotos();
    
    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error('Error in sync-photos API:', error);
    return NextResponse.json(
      { success: false, message: `${error}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync-photos
 * Trigger photo sync via cron or manual request
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret if configured
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Photo sync triggered via GET (cron or manual)');
    
    const result = await syncPhotos();
    
    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error('Error in sync-photos GET:', error);
    return NextResponse.json(
      { success: false, message: `${error}` },
      { status: 500 }
    );
  }
}
