import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { isKnownWebhookChannel } from '@/lib/db';
import { triggerYoutubeSyncWorkflow } from '@/lib/github-actions';
import { sendWebhookAlert } from '@/lib/notifications';

vi.mock('@/lib/db', () => ({
  isKnownWebhookChannel: vi.fn(),
}));
vi.mock('@/lib/github-actions', () => ({
  triggerYoutubeSyncWorkflow: vi.fn(),
}));
vi.mock('@/lib/notifications', () => ({
  sendWebhookAlert: vi.fn(),
}));

const mockedTrigger = vi.mocked(triggerYoutubeSyncWorkflow);
const mockedAlert = vi.mocked(sendWebhookAlert);

const mockedIsKnownChannel = vi.mocked(isKnownWebhookChannel);

// Headers Google sends on every notification for a channel we created
const CHANNEL_HEADERS = { 'x-goog-channel-id': 'channel-1', 'x-goog-resource-id': 'resource-1' };

function makeRequest(headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/webhook-drive-videos', {
    method: 'POST',
    headers: { ...CHANNEL_HEADERS, ...headers },
  });
}

beforeEach(() => {
  mockedIsKnownChannel.mockReset().mockResolvedValue(true);
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

  it('verifies the notification against the stored channel', async () => {
    await POST(makeRequest({ 'x-goog-resource-state': 'change' }));
    expect(mockedIsKnownChannel).toHaveBeenCalledWith('channel-1', 'resource-1', 'drive');
  });

  it('rejects a notification from an unknown channel without doing any work', async () => {
    mockedIsKnownChannel.mockResolvedValue(false);
    const response = await POST(makeRequest({ 'x-goog-resource-state': 'change' }));
    expect(response.status).toBe(403);
    expect(mockedTrigger).not.toHaveBeenCalled();
  });

  it('rejects a notification with no channel headers without hitting the database', async () => {
    const request = new NextRequest('http://localhost/api/webhook-drive-videos', {
      method: 'POST',
      headers: { 'x-goog-resource-state': 'change' },
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(mockedIsKnownChannel).not.toHaveBeenCalled();
    expect(mockedTrigger).not.toHaveBeenCalled();
  });
});
