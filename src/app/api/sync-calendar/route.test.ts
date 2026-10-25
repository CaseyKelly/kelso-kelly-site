import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { syncCalendarEvents } from '@/lib/sync';

vi.mock('@/lib/sync', () => ({
  syncCalendarEvents: vi.fn(),
}));

// Records each check-in's outcome the way Sentry would: 'ok' when the
// monitored callback resolves, 'error' when it rejects.
const { checkIns } = vi.hoisted(() => ({ checkIns: [] as { slug: string; status: string }[] }));
vi.mock('@sentry/nextjs', () => ({
  withMonitor: vi.fn((slug: string, callback: () => Promise<unknown>) =>
    callback().then(
      (r) => {
        checkIns.push({ slug, status: 'ok' });
        return r;
      },
      (e) => {
        checkIns.push({ slug, status: 'error' });
        throw e;
      }
    )
  ),
  flush: vi.fn().mockResolvedValue(true),
}));

const mockedSync = vi.mocked(syncCalendarEvents);

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/sync-calendar', { headers });
}

beforeEach(() => {
  mockedSync.mockReset();
  checkIns.length = 0;
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
  it('triggers a sync when CRON_SECRET is not configured', async () => {
    mockedSync.mockResolvedValue({ success: true, message: 'ok' });
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
  });

  it('rejects an incorrect bearer token when CRON_SECRET is configured', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const response = await POST(makeRequest({ authorization: 'Bearer wrong' }));
    expect(response.status).toBe(401);
    expect(mockedSync).not.toHaveBeenCalled();
  });

  it('accepts a matching bearer token', async () => {
    process.env.CRON_SECRET = 'super-secret';
    mockedSync.mockResolvedValue({ success: true, message: 'ok' });
    const response = await POST(makeRequest({ authorization: 'Bearer super-secret' }));
    expect(response.status).toBe(200);
  });
});

describe('Sentry cron monitoring', () => {
  const cronHeaders = { 'user-agent': 'vercel-cron/1.0', authorization: 'Bearer super-secret' };

  beforeEach(() => {
    process.env.CRON_SECRET = 'super-secret';
  });

  it('checks in ok for a successful Vercel Cron run', async () => {
    mockedSync.mockResolvedValue({ success: true, message: 'ok' });
    const response = await GET(makeRequest(cronHeaders));
    expect(response.status).toBe(200);
    expect(checkIns).toEqual([{ slug: 'sync-calendar', status: 'ok' }]);
  });

  it('checks in as failed when the sync reports failure, still returning the 500', async () => {
    mockedSync.mockResolvedValue({ success: false, message: 'Calendar API down' });
    const response = await GET(makeRequest(cronHeaders));
    expect(response.status).toBe(500);
    expect((await response.json()).message).toBe('Calendar API down');
    expect(checkIns).toEqual([{ slug: 'sync-calendar', status: 'error' }]);
  });

  it('does not check in for a request that fails auth', async () => {
    const response = await GET(makeRequest({ ...cronHeaders, authorization: 'Bearer wrong' }));
    expect(response.status).toBe(401);
    expect(checkIns).toEqual([]);
  });

  it('does not check in for manual or webhook-triggered runs', async () => {
    mockedSync.mockResolvedValue({ success: true, message: 'ok' });
    await GET(makeRequest({ authorization: 'Bearer super-secret' }));
    await POST(makeRequest({ authorization: 'Bearer super-secret', 'user-agent': 'vercel-cron/1.0' }));
    expect(checkIns).toEqual([]);
  });
});
