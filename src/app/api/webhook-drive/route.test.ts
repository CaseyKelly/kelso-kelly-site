import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { isKnownWebhookChannel } from '@/lib/db';
import { syncPhotos } from '@/lib/sync';
import { sendWebhookAlert } from '@/lib/notifications';

vi.mock('@/lib/db', () => ({
  isKnownWebhookChannel: vi.fn(),
}));
vi.mock('@/lib/sync', () => ({
  syncPhotos: vi.fn(),
}));
vi.mock('@/lib/notifications', () => ({
  sendWebhookAlert: vi.fn(),
}));

const mockedSync = vi.mocked(syncPhotos);
const mockedAlert = vi.mocked(sendWebhookAlert);

const mockedIsKnownChannel = vi.mocked(isKnownWebhookChannel);

// Headers Google sends on every notification for a channel we created
const CHANNEL_HEADERS = { 'x-goog-channel-id': 'channel-1', 'x-goog-resource-id': 'resource-1' };

function makeRequest(headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/webhook-drive', {
    method: 'POST',
    headers: { ...CHANNEL_HEADERS, ...headers },
  });
}

beforeEach(() => {
  mockedIsKnownChannel.mockReset().mockResolvedValue(true);
  mockedSync.mockReset();
  mockedAlert.mockReset();
  mockedAlert.mockResolvedValue(undefined);
});

describe('POST /api/webhook-drive', () => {
  it('acknowledges a sync-confirmation message without triggering a sync', async () => {
    const response = await POST(makeRequest({ 'x-goog-resource-state': 'sync' }));
    expect(response.status).toBe(200);
    expect(mockedSync).not.toHaveBeenCalled();
  });

  it.each(['change', 'update', 'exists', 'add', 'remove', 'trash', 'untrash'])(
    'triggers a forced photo sync on a "%s" notification',
    async (resourceState) => {
      mockedSync.mockResolvedValue({ success: true, message: 'synced' });
      const response = await POST(makeRequest({ 'x-goog-resource-state': resourceState }));
      expect(mockedSync).toHaveBeenCalledWith(true);
      expect(response.status).toBe(200);
    }
  );

  it('ignores an unrecognized notification state without syncing', async () => {
    const response = await POST(makeRequest({ 'x-goog-resource-state': 'something-new' }));
    expect(mockedSync).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('sends a webhook alert and still returns 200 when the sync reports failure', async () => {
    mockedSync.mockResolvedValue({ success: false, message: 'Drive API error' });
    const response = await POST(makeRequest({ 'x-goog-resource-state': 'change' }));
    expect(response.status).toBe(200);
    expect(mockedAlert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'renewal_failed', message: expect.stringContaining('photo sync failed') })
    );
  });

  it('sends a webhook alert and still returns 200 when the sync throws', async () => {
    mockedSync.mockRejectedValue(new Error('unexpected crash'));
    const response = await POST(makeRequest({ 'x-goog-resource-state': 'change' }));
    expect(response.status).toBe(200);
    expect(mockedAlert).toHaveBeenCalled();
  });

  it('verifies the notification against the stored channel', async () => {
    await POST(makeRequest({ 'x-goog-resource-state': 'change' }));
    expect(mockedIsKnownChannel).toHaveBeenCalledWith('channel-1', 'resource-1', 'drive');
  });

  it('rejects a notification from an unknown channel without doing any work', async () => {
    mockedIsKnownChannel.mockResolvedValue(false);
    const response = await POST(makeRequest({ 'x-goog-resource-state': 'change' }));
    expect(response.status).toBe(403);
    expect(mockedSync).not.toHaveBeenCalled();
  });

  it('rejects a notification with no channel headers without hitting the database', async () => {
    const request = new NextRequest('http://localhost/api/webhook-drive', {
      method: 'POST',
      headers: { 'x-goog-resource-state': 'change' },
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(mockedIsKnownChannel).not.toHaveBeenCalled();
    expect(mockedSync).not.toHaveBeenCalled();
  });
});
