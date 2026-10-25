import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { cleanupAllWebhooks, initializeWebhooks } from '@/lib/webhooks';

vi.mock('@/lib/webhooks', () => ({
  cleanupAllWebhooks: vi.fn(),
  initializeWebhooks: vi.fn(),
}));

const mockedCleanup = vi.mocked(cleanupAllWebhooks);
const mockedInit = vi.mocked(initializeWebhooks);

function makeRequest(body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/webhooks/cleanup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  mockedCleanup.mockReset();
  mockedInit.mockReset();
  mockedCleanup.mockResolvedValue({ stopped: 2, failed: 0, deleted: 2 });
});

describe('GET /api/webhooks/cleanup', () => {
  it('returns endpoint info with no auth required', async () => {
    const response = await GET(makeRequest());
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.endpoint).toBe('/api/webhooks/cleanup');
  });
});

describe('POST /api/webhooks/cleanup', () => {
  it('always rejects when WEBHOOK_SETUP_SECRET is not configured, even with no auth header', async () => {
    delete process.env.WEBHOOK_SETUP_SECRET;
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(401);
    expect(mockedCleanup).not.toHaveBeenCalled();
  });

  it('rejects a mismatched bearer token', async () => {
    process.env.WEBHOOK_SETUP_SECRET = 'super-secret';
    const response = await POST(makeRequest({}, { authorization: 'Bearer wrong' }));
    expect(response.status).toBe(401);
  });

  it('cleans up without reinitializing by default', async () => {
    process.env.WEBHOOK_SETUP_SECRET = 'super-secret';
    const response = await POST(makeRequest({}, { authorization: 'Bearer super-secret' }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(mockedInit).not.toHaveBeenCalled();
    expect(json.message).toContain('Cleaned up 2 webhooks successfully');
  });

  it('reinitializes after cleanup when reinitialize:true is passed', async () => {
    process.env.WEBHOOK_SETUP_SECRET = 'super-secret';
    mockedInit.mockResolvedValue({
      calendar: {},
      drivePhotos: {},
      driveVideos: null,
      cleanup: { stopped: 0, failed: 0, deleted: 0 },
      errors: [],
    });
    const response = await POST(makeRequest({ reinitialize: true }, { authorization: 'Bearer super-secret' }));
    const json = await response.json();
    expect(mockedInit).toHaveBeenCalledWith('https://kelso-kelly-site.vercel.app');
    expect(json.message).toContain('re-initialized successfully');
  });

  it('reports partial failure when reinitialize has errors', async () => {
    process.env.WEBHOOK_SETUP_SECRET = 'super-secret';
    mockedInit.mockResolvedValue({
      calendar: null,
      drivePhotos: {},
      driveVideos: null,
      cleanup: { stopped: 0, failed: 0, deleted: 0 },
      errors: ['Calendar: boom'],
    });
    const response = await POST(makeRequest({ reinitialize: true }, { authorization: 'Bearer super-secret' }));
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('re-initialization had 1 error(s)');
  });

  it('defaults reinitialize to false when the body is malformed JSON', async () => {
    process.env.WEBHOOK_SETUP_SECRET = 'super-secret';
    const request = new NextRequest('http://localhost/api/webhooks/cleanup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer super-secret' },
      body: 'not json',
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockedInit).not.toHaveBeenCalled();
  });
});
