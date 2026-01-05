import { NextRequest, NextResponse } from 'next/server';
import { syncCalendarEvents } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds max execution time

/**
 * POST /api/sync-calendar
 * Manually trigger a calendar sync
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication here
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.SYNC_API_SECRET}`) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    console.log('Manual calendar sync triggered');
    
    const result = await syncCalendarEvents();
    
    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error('Error in sync-calendar API:', error);
    return NextResponse.json(
      { success: false, message: `${error}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync-calendar
 * Get sync status (for monitoring)
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/api/sync-calendar',
    method: 'POST',
    description: 'Trigger calendar sync from Google Calendar to database',
  });
}
