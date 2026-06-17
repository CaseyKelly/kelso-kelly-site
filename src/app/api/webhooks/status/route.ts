import { NextRequest, NextResponse } from 'next/server';
import { getWebhookChannels } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface WebhookStatus {
  channel_id: string;
  resource_type: string;
  resource_id: string;
  expiration: number;
  expires_at: string;
  time_until_expiration: string;
  status: 'active' | 'expiring_soon' | 'expired';
  needs_renewal: boolean;
}

/**
 * GET /api/webhooks/status
 * Returns status of all registered webhooks with expiration info
 * Requires WEBHOOK_SETUP_SECRET for authentication
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Authentication check
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.WEBHOOK_SETUP_SECRET}`;
  
  if (!process.env.WEBHOOK_SETUP_SECRET || authHeader !== expectedAuth) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const channels = await getWebhookChannels();
    const now = Date.now();
    const renewalThreshold = 24 * 60 * 60 * 1000; // 24 hours

    const webhooks: WebhookStatus[] = channels.map((channel: any) => {
      // Ensure expiration is a valid number
      const expiration = typeof channel.expiration === 'number' 
        ? channel.expiration 
        : parseInt(channel.expiration);
      
      const timeUntil = expiration - now;
      const isExpired = timeUntil <= 0;
      const isExpiringSoon = !isExpired && timeUntil < renewalThreshold;
      
      return {
        channel_id: channel.channel_id,
        resource_type: channel.resource_type,
        resource_id: channel.resource_id,
        expiration,
        expires_at: new Date(expiration).toISOString(),
        time_until_expiration: formatTimeUntil(timeUntil),
        status: isExpired ? 'expired' : isExpiringSoon ? 'expiring_soon' : 'active',
        needs_renewal: isExpired || isExpiringSoon,
      };
    });

    // Detect duplicates
    const duplicates = new Map<string, number>();
    for (const webhook of webhooks) {
      const count = duplicates.get(webhook.resource_type) || 0;
      duplicates.set(webhook.resource_type, count + 1);
    }

    const hasDuplicates = Array.from(duplicates.values()).some(count => count > 1);

    const summary = {
      total: webhooks.length,
      active: webhooks.filter(w => w.status === 'active').length,
      expiring_soon: webhooks.filter(w => w.status === 'expiring_soon').length,
      expired: webhooks.filter(w => w.status === 'expired').length,
      has_duplicates: hasDuplicates,
      duplicates_by_type: hasDuplicates ? Object.fromEntries(duplicates) : null,
    };

    return NextResponse.json({
      webhooks,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting webhook status:', error);
    return NextResponse.json(
      { error: `Failed to get webhook status: ${error}` },
      { status: 500 }
    );
  }
}

/**
 * Format milliseconds to human-readable time
 */
function formatTimeUntil(ms: number): string {
  if (ms <= 0) return 'expired';
  
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  
  return `${hours}h ${minutes}m`;
}
