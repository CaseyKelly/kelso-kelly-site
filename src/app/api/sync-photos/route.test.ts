import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { syncPhotos } from '@/lib/sync';

vi.mock('@/lib/sync', () => ({
  syncPhotos: vi.fn(),
}));

const mockedSync = vi.mocked(syncPhotos);

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/sync-photos', { headers });
}

beforeEach(() => {
  mockedSync.mockReset();
  delete process.env.CRON_SECRET;
});

describe('GET /api/sync-photos', () => {
  it('rejects an incorrect CRON_SECRET bearer token', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const response = await GET(makeRequest({ authorization: 'Bearer wrong' }));
    expect(response.status).toBe(401);
    expect(mockedSync).not.toHaveBeenCalled();
  });

  it('runs the sync and returns 500 when it reports failure (e.g. real errors, not HEIC skips)', async () => {
    mockedSync.mockResolvedValue({ success: false, message: 'Photo sync complete - Errors: 2' });
    const response = await GET(makeRequest());
    expect(response.status).toBe(500);
  });
});

describe('POST /api/sync-photos', () => {
  it('triggers the sync with no auth check and returns 200 on success', async () => {
    mockedSync.mockResolvedValue({ success: true, message: 'ok' });
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(mockedSync).toHaveBeenCalled();
  });
});
