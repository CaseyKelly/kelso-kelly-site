import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { getWebhookChannels } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  getWebhookChannels: vi.fn(),
}));

const mockedGetChannels = vi.mocked(getWebhookChannels);

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/webhooks/status', { headers });
}

beforeEach(() => {
  mockedGetChannels.mockReset();
  process.env.WEBHOOK_SETUP_SECRET = 'super-secret';
});

describe('GET /api/webhooks/status', () => {
  it('always rejects when WEBHOOK_SETUP_SECRET is not configured', async () => {
    delete process.env.WEBHOOK_SETUP_SECRET;
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
  });

  it('rejects a mismatched bearer token', async () => {
    const response = await GET(makeRequest({ authorization: 'Bearer wrong' }));
    expect(response.status).toBe(401);
  });

  it('classifies channels as active, expiring_soon, and expired', async () => {
    const now = Date.now();
    mockedGetChannels.mockResolvedValue([
      { channel_id: 'active-1', resource_type: 'calendar', resource_id: 'r1', expiration: now + 48 * 60 * 60 * 1000 },
      { channel_id: 'soon-1', resource_type: 'drive', resource_id: 'r2', expiration: now + 2 * 60 * 60 * 1000 },
      { channel_id: 'expired-1', resource_type: 'drive', resource_id: 'r3', expiration: now - 1000 },
    ] as never);

    const response = await GET(makeRequest({ authorization: 'Bearer super-secret' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    const byId = Object.fromEntries(json.webhooks.map((w: { channel_id: string }) => [w.channel_id, w]));
    expect(byId['active-1'].status).toBe('active');
    expect(byId['active-1'].needs_renewal).toBe(false);
    expect(byId['soon-1'].status).toBe('expiring_soon');
    expect(byId['soon-1'].needs_renewal).toBe(true);
    expect(byId['expired-1'].status).toBe('expired');
    expect(byId['expired-1'].time_until_expiration).toBe('expired');
    expect(json.summary).toMatchObject({ total: 3, active: 1, expiring_soon: 1, expired: 1 });
  });

  it('detects duplicate channels of the same resource_type', async () => {
    const now = Date.now();
    mockedGetChannels.mockResolvedValue([
      { channel_id: 'cal-1', resource_type: 'calendar', resource_id: 'r1', expiration: now + 60000 },
      { channel_id: 'cal-2', resource_type: 'calendar', resource_id: 'r2', expiration: now + 60000 },
    ] as never);

    const response = await GET(makeRequest({ authorization: 'Bearer super-secret' }));
    const json = await response.json();

    expect(json.summary.has_duplicates).toBe(true);
    expect(json.summary.duplicates_by_type).toEqual({ calendar: 2 });
  });

  it('formats multi-day time-until-expiration as "Xd Yh"', async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      mockedGetChannels.mockResolvedValue([
        { channel_id: 'far-out', resource_type: 'calendar', resource_id: 'r1', expiration: now + 50 * 60 * 60 * 1000 },
      ] as never);

      const response = await GET(makeRequest({ authorization: 'Bearer super-secret' }));
      const json = await response.json();

      expect(json.webhooks[0].time_until_expiration).toBe('2d 2h');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns 500 when the DB lookup throws', async () => {
    mockedGetChannels.mockRejectedValue(new Error('db down'));
    const response = await GET(makeRequest({ authorization: 'Bearer super-secret' }));
    expect(response.status).toBe(500);
  });
});
