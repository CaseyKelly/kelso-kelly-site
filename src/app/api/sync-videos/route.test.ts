import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { syncVideos } from '@/lib/sync';

vi.mock('@/lib/sync', () => ({
  syncVideos: vi.fn(),
}));

const mockedSync = vi.mocked(syncVideos);

beforeEach(() => {
  mockedSync.mockReset();
  mockedSync.mockResolvedValue({ success: true, message: 'ok' });
  delete process.env.CRON_SECRET;
});

describe('POST /api/sync-videos', () => {
  it('passes force=true through when the query param is set', async () => {
    const request = new NextRequest('http://localhost/api/sync-videos?force=true', { method: 'POST' });
    await POST(request);
    expect(mockedSync).toHaveBeenCalledWith(true);
  });

  it('defaults to force=false when the query param is absent', async () => {
    const request = new NextRequest('http://localhost/api/sync-videos', { method: 'POST' });
    await POST(request);
    expect(mockedSync).toHaveBeenCalledWith(false);
  });

  it('rejects an incorrect CRON_SECRET bearer token, even with force=true', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const request = new NextRequest('http://localhost/api/sync-videos?force=true', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong' },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(mockedSync).not.toHaveBeenCalled();
  });
});

describe('GET /api/sync-videos', () => {
  it('ignores the force query param (only POST supports it) and always calls syncVideos with no args', async () => {
    const request = new NextRequest('http://localhost/api/sync-videos?force=true');
    await GET(request);
    expect(mockedSync).toHaveBeenCalledWith();
  });

  it('rejects an incorrect CRON_SECRET bearer token', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const request = new NextRequest('http://localhost/api/sync-videos', {
      headers: { authorization: 'Bearer wrong' },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(mockedSync).not.toHaveBeenCalled();
  });
});
