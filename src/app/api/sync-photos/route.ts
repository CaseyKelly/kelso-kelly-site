import { NextRequest, NextResponse } from 'next/server';
import { syncPhotos } from '@/lib/sync';
import { CRON_MONITORS, withCronMonitor } from '@/lib/cron-monitor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max execution time (photos can take longer)

/**
 * POST /api/sync-photos
 * Manually trigger a photo sync from Google Drive
 * Requires the CRON_SECRET bearer token when CRON_SECRET is configured
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Manual photo sync triggered');

    const result = await syncPhotos();

    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error('Error in sync-photos API:', error);
    return NextResponse.json({ success: false, message: `${error}` }, { status: 500 });
  }
}

/**
 * GET /api/sync-photos
 * Trigger photo sync via cron or manual request
 */
export async function GET(request: NextRequest) {
  // Verify cron secret if configured (before, and outside, the cron monitor)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return withCronMonitor(request, CRON_MONITORS['/api/sync-photos'], runPhotoSyncJob);
}

async function runPhotoSyncJob(): Promise<NextResponse> {
  try {
    console.log('Photo sync triggered via GET (cron or manual)');

    const result = await syncPhotos();

    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error('Error in sync-photos GET:', error);
    return NextResponse.json({ success: false, message: `${error}` }, { status: 500 });
  }
}
