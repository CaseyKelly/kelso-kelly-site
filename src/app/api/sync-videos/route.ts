import { NextRequest, NextResponse } from 'next/server';
import { syncVideos } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds max execution time

/**
 * POST /api/sync-videos
 * Manually trigger a video sync from Google Sheets
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication here
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.SYNC_API_SECRET}`) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    // Check for force parameter in query string
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    console.log('Manual video sync triggered', force ? '(forced)' : '');
    
    const result = await syncVideos(force);
    
    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error('Error in sync-videos API:', error);
    return NextResponse.json(
      { success: false, message: `${error}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync-videos
 * Trigger video sync via cron or manual request
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret if configured
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Video sync triggered via GET (cron or manual)');
    
    const result = await syncVideos();
    
    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error('Error in sync-videos GET:', error);
    return NextResponse.json(
      { success: false, message: `${error}` },
      { status: 500 }
    );
  }
}
