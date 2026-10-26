import { NextRequest, NextResponse } from 'next/server';
import { syncCalendarEvents } from '@/lib/sync';
import { CRON_MONITORS, withCronMonitor } from '@/lib/cron-monitor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds max execution time

/**
 * POST /api/sync-calendar
 * Manually trigger a calendar sync
 * Requires the CRON_SECRET bearer token when CRON_SECRET is configured
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Manual calendar sync triggered');

    const result = await syncCalendarEvents();

    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error('Error in sync-calendar API:', error);
    return NextResponse.json({ success: false, message: `${error}` }, { status: 500 });
  }
}

/**
 * GET /api/sync-calendar
 * Trigger calendar sync via cron or manual request
 */
export async function GET(request: NextRequest) {
  // Verify cron secret if configured (before, and outside, the cron monitor)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return withCronMonitor(request, CRON_MONITORS['/api/sync-calendar'], runCalendarSyncJob);
}

async function runCalendarSyncJob(): Promise<NextResponse> {
  try {
    console.log('Calendar sync triggered via GET (cron or manual)');

    const result = await syncCalendarEvents();

    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error('Error in sync-calendar GET:', error);
    return NextResponse.json({ success: false, message: `${error}` }, { status: 500 });
  }
}
