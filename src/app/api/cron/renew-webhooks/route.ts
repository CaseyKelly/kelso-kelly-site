import { NextRequest, NextResponse } from 'next/server';
import { renewWebhooks } from '@/lib/webhooks';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/renew-webhooks
 * Cron job to renew expiring webhooks
 * Runs daily via Vercel Cron
 */
export async function GET(request: NextRequest) {
  try {
    // Verify this is called by Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Running webhook renewal cron job...');
    
    // Get the base URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                    'http://localhost:3000';
    
    const results = await renewWebhooks(baseUrl);
    
    console.log('Webhook renewal completed:', results);
    
    return NextResponse.json({
      success: true,
      renewed: results.renewed,
      failed: results.failed,
      message: `Renewed ${results.renewed.length} webhooks, ${results.failed.length} failed`,
    });
  } catch (error) {
    console.error('Error in webhook renewal cron:', error);
    return NextResponse.json(
      { success: false, error: `${error}` },
      { status: 500 }
    );
  }
}
