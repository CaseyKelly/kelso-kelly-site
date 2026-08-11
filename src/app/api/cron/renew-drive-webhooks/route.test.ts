import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { getWebhookChannels, deleteWebhookChannel } from '@/lib/db';
import { setupDriveWebhook } from '@/lib/webhooks';
import { stopWatchingFolder } from '@/lib/google-drive';
import { sendWebhookAlert } from '@/lib/notifications';

vi.mock('@/lib/db', () => ({
  getWebhookChannels: vi.fn(),
  deleteWebhookChannel: vi.fn(),
}));
vi.mock('@/lib/webhooks', () => ({
  setupDriveWebhook: vi.fn(),
}));
vi.mock('@/lib/google-drive', () => ({
  stopWatchingFolder: vi.fn(),
}));
vi.mock('@/lib/notifications', () => ({
  sendWebhookAlert: vi.fn(),
}));

const mockedGetChannels = vi.mocked(getWebhookChannels);
const mockedDelete = vi.mocked(deleteWebhookChannel);
const mockedSetupDrive = vi.mocked(setupDriveWebhook);
const mockedStopFolder = vi.mocked(stopWatchingFolder);
const mockedAlert = vi.mocked(sendWebhookAlert);

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/cron/renew-drive-webhooks', { headers });
}

function driveChannel(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    channel_id: 'drive-1',
    resource_type: 'drive' as const,
    resource_id: 'res-1',
    expiration: Date.now() + 1000,
    webhook_url: 'https://example.com/api/webhook-drive',
    folder_id: 'folder-1',
    ...overrides,
  };
}

beforeEach(() => {
  mockedGetChannels.mockReset();
  mockedDelete.mockReset().mockResolvedValue([] as never);
  mockedSetupDrive.mockReset();
  mockedStopFolder.mockReset().mockResolvedValue(undefined as never);
  mockedAlert.mockReset().mockResolvedValue(undefined);
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/renew-drive-webhooks', () => {
  it('rejects an incorrect CRON_SECRET bearer token', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const response = await GET(makeRequest({ authorization: 'Bearer wrong' }));
    expect(response.status).toBe(401);
    expect(mockedGetChannels).not.toHaveBeenCalled();
  });

  it('only considers drive channels, ignoring calendar channels', async () => {
    mockedGetChannels.mockResolvedValue([
      { channel_id: 'cal-1', resource_type: 'calendar', resource_id: 'r1', expiration: Date.now() },
    ] as never);

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(mockedStopFolder).not.toHaveBeenCalled();
    expect(json.renewed).toBe(0);
  });

  it('does not renew a Drive channel with more than 18h remaining', async () => {
    mockedGetChannels.mockResolvedValue([driveChannel({ expiration: Date.now() + 20 * 60 * 60 * 1000 })] as never);

    await GET(makeRequest());

    expect(mockedSetupDrive).not.toHaveBeenCalled();
  });

  it('renews a Drive channel expiring within 18h: stop, create, delete old record', async () => {
    mockedGetChannels.mockResolvedValue([driveChannel({ expiration: Date.now() + 60 * 1000 })] as never);
    mockedSetupDrive.mockResolvedValue({ channelId: 'drive-2', resourceId: 'res-2', expiration: Date.now() + 999999 });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(mockedStopFolder).toHaveBeenCalledWith('drive-1', 'res-1');
    expect(mockedSetupDrive).toHaveBeenCalledWith('https://example.com/api/webhook-drive', 'folder-1');
    expect(mockedDelete).toHaveBeenCalledWith('drive-1');
    expect(json.renewed).toBe(1);
    expect(json.success).toBe(true);
  });

  it('tolerates a failure stopping the old channel and still renews', async () => {
    mockedGetChannels.mockResolvedValue([driveChannel({ expiration: Date.now() + 60 * 1000 })] as never);
    mockedStopFolder.mockRejectedValue(new Error('already expired'));
    mockedSetupDrive.mockResolvedValue({ channelId: 'drive-2', resourceId: 'res-2', expiration: Date.now() + 999999 });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(json.renewed).toBe(1);
  });

  it('fails and alerts when the channel is missing webhook_url/folder_id', async () => {
    mockedGetChannels.mockResolvedValue([
      driveChannel({ expiration: Date.now() + 60 * 1000, webhook_url: null, folder_id: null }),
    ] as never);

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(mockedSetupDrive).not.toHaveBeenCalled();
    expect(json.failed).toBe(1);
    expect(json.success).toBe(false);
    expect(mockedAlert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'renewal_failed', message: expect.stringContaining('drive-1') })
    );
  });

  it('sends an alert and returns 500 when an unexpected error occurs', async () => {
    mockedGetChannels.mockRejectedValue(new Error('db unreachable'));
    const response = await GET(makeRequest());
    expect(response.status).toBe(500);
    expect(mockedAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Drive webhook renewal cron failed' })
    );
  });
});
