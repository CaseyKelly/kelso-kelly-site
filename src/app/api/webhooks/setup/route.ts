import { NextRequest, NextResponse } from 'next/server';
import { initializeWebhooks } from '@/lib/webhooks';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/setup
 * Initialize all webhooks
 * This should be called once after deployment to set up webhooks
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication
    const authHeader = request.headers.get('authorization');
    const secret = process.env.WEBHOOK_SETUP_SECRET || process.env.REVALIDATE_SECRET;
    
    if (secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the base URL from the request or environment
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                    request.headers.get('origin') || 
                    'http://localhost:3000';
    
    console.log('Setting up webhooks for base URL:', baseUrl);
    
    const results = await initializeWebhooks(baseUrl);
    
    return NextResponse.json({
      success: results.errors.length === 0,
      results,
      message: results.errors.length === 0 
        ? 'All webhooks set up successfully' 
        : 'Some webhooks failed to set up',
    });
  } catch (error) {
    console.error('Error setting up webhooks:', error);
    return NextResponse.json(
      { success: false, error: `${error}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/setup
 * Get setup instructions
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/api/webhooks/setup',
    method: 'POST',
    description: 'Initialize all Google webhooks (Calendar and Drive)',
    authentication: 'Bearer token in Authorization header (optional)',
    note: 'Call this once after deployment to set up webhooks',
  });
}
