import { NextRequest, NextResponse } from 'next/server';
import { cleanupAllWebhooks, initializeWebhooks } from '@/lib/webhooks';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/cleanup
 * Clean up ALL webhooks and optionally reinitialize them
 * Body: { "reinitialize": true } to re-setup after cleanup
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Authentication check
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.WEBHOOK_SETUP_SECRET}`;

  if (!process.env.WEBHOOK_SETUP_SECRET || authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({ reinitialize: false }));
    const { reinitialize } = body;

    // Clean up all webhooks
    console.log('Starting webhook cleanup...');
    const cleanup = await cleanupAllWebhooks();

    let setup = null;
    if (reinitialize) {
      // Re-setup webhooks immediately after cleanup
      console.log('Re-initializing webhooks after cleanup...');
      setup = await initializeWebhooks('https://kelso-kelly-site.vercel.app');
    }

    // Determine overall success based on cleanup and setup results
    const cleanupSuccess = cleanup.failed === 0;
    const setupSuccess = !setup || setup.errors.length === 0;
    const overallSuccess = cleanupSuccess && setupSuccess;

    // Build detailed message
    let message;
    if (reinitialize) {
      if (overallSuccess) {
        message = `Cleaned up ${cleanup.deleted} webhooks and re-initialized successfully`;
      } else {
        const parts = [];
        if (!cleanupSuccess) {
          parts.push(`cleanup had ${cleanup.failed} failure(s)`);
        }
        if (!setupSuccess) {
          parts.push(`re-initialization had ${setup!.errors.length} error(s)`);
        }
        message = `Cleaned up ${cleanup.deleted} webhooks, but ${parts.join(' and ')}`;
      }
    } else {
      if (cleanupSuccess) {
        message = `Cleaned up ${cleanup.deleted} webhooks successfully`;
      } else {
        message = `Cleaned up ${cleanup.deleted} webhooks with ${cleanup.failed} failure(s)`;
      }
    }

    return NextResponse.json({
      success: overallSuccess,
      cleanup,
      setup,
      message,
    });
  } catch (error) {
    console.error('Error in cleanup:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/cleanup
 * Get information about this endpoint
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({
    endpoint: '/api/webhooks/cleanup',
    method: 'POST',
    description: 'Clean up all webhook channels and optionally reinitialize',
    authentication: 'Bearer token in Authorization header (WEBHOOK_SETUP_SECRET)',
    body: {
      reinitialize: 'boolean (optional) - Set to true to re-setup webhooks after cleanup',
    },
    note: 'Use this to fix duplicate webhooks or reset the webhook system',
  });
}
