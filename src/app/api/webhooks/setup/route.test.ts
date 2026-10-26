import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { initializeWebhooks } from '@/lib/webhooks';

vi.mock('@/lib/webhooks', () => ({
  initializeWebhooks: vi.fn(),
}));

const mockedInit = vi.mocked(initializeWebhooks);

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/webhooks/setup', { method: 'POST', headers });
}

beforeEach(() => {
  mockedInit.mockReset();
  delete process.env.WEBHOOK_SETUP_SECRET;
  delete process.env.REVALIDATE_SECRET;
});

describe('GET /api/webhooks/setup', () => {
  it('returns setup instructions with no auth required', async () => {
    const response = await GET(makeRequest());
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.endpoint).toBe('/api/webhooks/setup');
  });
});

describe('POST /api/webhooks/setup', () => {
  it('rejects every request when neither secret env var is configured', async () => {
    const response = await POST(makeRequest({ authorization: 'Bearer undefined' }));
    expect(response.status).toBe(401);
    expect(mockedInit).not.toHaveBeenCalled();
  });

  it('runs with a matching WEBHOOK_SETUP_SECRET bearer token', async () => {
    process.env.WEBHOOK_SETUP_SECRET = 'super-secret';
    mockedInit.mockResolvedValue({
      calendar: {},
      drivePhotos: {},
      driveVideos: null,
      cleanup: { stopped: 0, failed: 0, deleted: 0 },
      errors: [],
    });
    const response = await POST(makeRequest({ authorization: 'Bearer super-secret' }));
    expect(response.status).toBe(200);
    expect(mockedInit).toHaveBeenCalledWith('https://kelso-kelly-site.vercel.app');
  });

  it('rejects a missing/incorrect bearer token when WEBHOOK_SETUP_SECRET is configured', async () => {
    process.env.WEBHOOK_SETUP_SECRET = 'super-secret';
    const response = await POST(makeRequest({ authorization: 'Bearer wrong' }));
    expect(response.status).toBe(401);
    expect(mockedInit).not.toHaveBeenCalled();
  });

  it('accepts REVALIDATE_SECRET as a fallback when WEBHOOK_SETUP_SECRET is unset', async () => {
    process.env.REVALIDATE_SECRET = 'other-secret';
    mockedInit.mockResolvedValue({
      calendar: {},
      drivePhotos: {},
      driveVideos: null,
      cleanup: { stopped: 0, failed: 0, deleted: 0 },
      errors: [],
    });
    const response = await POST(makeRequest({ authorization: 'Bearer other-secret' }));
    expect(response.status).toBe(200);
  });

  it('reports success:false when initializeWebhooks collects errors', async () => {
    process.env.WEBHOOK_SETUP_SECRET = 'super-secret';
    mockedInit.mockResolvedValue({
      calendar: null,
      drivePhotos: {},
      driveVideos: null,
      cleanup: { stopped: 0, failed: 0, deleted: 0 },
      errors: ['Calendar: boom'],
    });
    const response = await POST(makeRequest({ authorization: 'Bearer super-secret' }));
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('Some webhooks failed');
  });

  it('returns 500 when initializeWebhooks throws', async () => {
    process.env.WEBHOOK_SETUP_SECRET = 'super-secret';
    mockedInit.mockRejectedValue(new Error('unexpected'));
    const response = await POST(makeRequest({ authorization: 'Bearer super-secret' }));
    expect(response.status).toBe(500);
  });
});
