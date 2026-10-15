import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { syncPhotos } from '@/lib/sync';
import { sendWebhookAlert } from '@/lib/notifications';

vi.mock('@/lib/sync', () => ({
  syncPhotos: vi.fn(),
}));
vi.mock('@/lib/notifications', () => ({
  sendWebhookAlert: vi.fn(),
}));

const mockedSync = vi.mocked(syncPhotos);
const mockedAlert = vi.mocked(sendWebhookAlert);

function makeRequest(headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/webhook-drive', { method: 'POST', headers });
}

beforeEach(() => {
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
});
