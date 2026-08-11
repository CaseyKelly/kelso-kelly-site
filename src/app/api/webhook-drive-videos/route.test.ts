import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { triggerYoutubeSyncWorkflow } from '@/lib/github-actions';
import { sendWebhookAlert } from '@/lib/notifications';

vi.mock('@/lib/github-actions', () => ({
  triggerYoutubeSyncWorkflow: vi.fn(),
}));
vi.mock('@/lib/notifications', () => ({
  sendWebhookAlert: vi.fn(),
}));

const mockedTrigger = vi.mocked(triggerYoutubeSyncWorkflow);
const mockedAlert = vi.mocked(sendWebhookAlert);

function makeRequest(headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/webhook-drive-videos', { method: 'POST', headers });
}

beforeEach(() => {
  mockedTrigger.mockReset();
  mockedAlert.mockReset().mockResolvedValue(undefined);
});

describe('GET /api/webhook-drive-videos', () => {
  it('returns a health check with no auth required', async () => {
    const response = await GET();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.status).toBe('active');
  });
});

describe('POST /api/webhook-drive-videos', () => {
  it('acknowledges a sync-confirmation message without dispatching the workflow', async () => {
    const response = await POST(makeRequest({ 'x-goog-resource-state': 'sync' }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true });
    expect(mockedTrigger).not.toHaveBeenCalled();
  });

  it.each(['change', 'update', 'exists'])('dispatches the YouTube sync workflow on a "%s" notification', async (resourceState) => {
    mockedTrigger.mockResolvedValue(undefined);
    const response = await POST(makeRequest({ 'x-goog-resource-state': resourceState }));
    const json = await response.json();
    expect(mockedTrigger).toHaveBeenCalled();
    expect(json).toEqual({ received: true, dispatched: true });
  });

  it('alerts and still returns 200 when dispatching the workflow fails', async () => {
    mockedTrigger.mockRejectedValue(new Error('GITHUB_ACTIONS_TOKEN not configured'));
    const response = await POST(makeRequest({ 'x-goog-resource-state': 'change' }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.dispatched).toBe(false);
    expect(mockedAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('failed to dispatch') })
    );
  });

  it('acknowledges an unrecognized resource state generically', async () => {
    const response = await POST(makeRequest({}));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true });
    expect(mockedTrigger).not.toHaveBeenCalled();
  });
});
