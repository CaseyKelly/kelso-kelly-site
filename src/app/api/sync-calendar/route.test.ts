import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { syncCalendarEvents } from '@/lib/sync';

vi.mock('@/lib/sync', () => ({
  syncCalendarEvents: vi.fn(),
}));

const mockedSync = vi.mocked(syncCalendarEvents);

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/sync-calendar', { headers });
}

beforeEach(() => {
  mockedSync.mockReset();
  delete process.env.CRON_SECRET;
});

describe('GET /api/sync-calendar', () => {
  it('runs the sync when CRON_SECRET is not configured', async () => {
    mockedSync.mockResolvedValue({ success: true, message: 'ok' });
    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
    expect(mockedSync).toHaveBeenCalled();
  });

  it('rejects requests with a missing/incorrect bearer token when CRON_SECRET is configured', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const response = await GET(makeRequest({ authorization: 'Bearer wrong' }));
    expect(response.status).toBe(401);
    expect(mockedSync).not.toHaveBeenCalled();
  });

  it('accepts a matching bearer token', async () => {
    process.env.CRON_SECRET = 'super-secret';
    mockedSync.mockResolvedValue({ success: true, message: 'ok' });
    const response = await GET(makeRequest({ authorization: 'Bearer super-secret' }));
    expect(response.status).toBe(200);
    expect(mockedSync).toHaveBeenCalled();
  });

  it('returns 500 when the sync itself reports failure', async () => {
    mockedSync.mockResolvedValue({ success: false, message: 'Calendar API down' });
    const response = await GET(makeRequest());
    expect(response.status).toBe(500);
  });
});

describe('POST /api/sync-calendar', () => {
  it('triggers a sync with no auth check', async () => {
    mockedSync.mockResolvedValue({ success: true, message: 'ok' });
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
  });
});
