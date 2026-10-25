import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { getWebhookChannels, deleteWebhookChannel } from '@/lib/db';
import { setupDriveWebhook, getExpectedDriveWebhooks } from '@/lib/webhooks';
import { stopWatchingFolder } from '@/lib/google-drive';
import { sendWebhookAlert } from '@/lib/notifications';

vi.mock('@/lib/db', () => ({
  getWebhookChannels: vi.fn(),
  deleteWebhookChannel: vi.fn(),
}));
vi.mock('@/lib/webhooks', () => ({
  setupDriveWebhook: vi.fn(),
  getExpectedDriveWebhooks: vi.fn(),
}));
vi.mock('@/lib/google-drive', () => ({
  stopWatchingFolder: vi.fn(),
}));
vi.mock('@/lib/notifications', () => ({
  sendWebhookAlert: vi.fn(),
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

const mockedGetChannels = vi.mocked(getWebhookChannels);
const mockedDelete = vi.mocked(deleteWebhookChannel);
const mockedSetupDrive = vi.mocked(setupDriveWebhook);
const mockedExpected = vi.mocked(getExpectedDriveWebhooks);
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
  mockedExpected.mockReset().mockReturnValue([]);
  mockedStopFolder.mockReset().mockResolvedValue(undefined as never);
  mockedAlert.mockReset().mockResolvedValue(undefined);
  checkIns.length = 0;
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

  it('retires a legacy channel missing webhook_url/folder_id instead of failing forever', async () => {
    mockedGetChannels.mockResolvedValue([
      driveChannel({ expiration: Date.now() + 60 * 1000, webhook_url: null, folder_id: null }),
    ] as never);

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(mockedStopFolder).toHaveBeenCalledWith('drive-1', 'res-1');
    expect(mockedDelete).toHaveBeenCalledWith('drive-1');
    expect(mockedSetupDrive).not.toHaveBeenCalled();
    expect(json.failed).toBe(0);
    expect(mockedAlert).not.toHaveBeenCalled();
  });

  it('re-creates a webhook for a configured folder that has no channel', async () => {
    mockedExpected.mockReturnValue([
      { webhookUrl: 'https://example.com/api/webhook-drive', folderId: 'photos-folder' },
      { webhookUrl: 'https://example.com/api/webhook-drive-videos', folderId: 'videos-folder' },
    ]);
    mockedGetChannels.mockResolvedValue([
      driveChannel({
        expiration: Date.now() + 20 * 60 * 60 * 1000,
        webhook_url: 'https://example.com/api/webhook-drive-videos',
        folder_id: 'videos-folder',
      }),
    ] as never);
    mockedSetupDrive.mockResolvedValue({ channelId: 'drive-new', resourceId: 'res-new', expiration: Date.now() + 999999 });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(mockedSetupDrive).toHaveBeenCalledTimes(1);
    expect(mockedSetupDrive).toHaveBeenCalledWith('https://example.com/api/webhook-drive', 'photos-folder');
    expect(json.created).toBe(1);
    expect(json.success).toBe(true);
  });

  it('re-creates the webhook for a retired legacy channel', async () => {
    mockedExpected.mockReturnValue([
      { webhookUrl: 'https://example.com/api/webhook-drive', folderId: 'photos-folder' },
    ]);
    mockedGetChannels.mockResolvedValue([
      driveChannel({ webhook_url: null, folder_id: null }),
    ] as never);
    mockedSetupDrive.mockResolvedValue({ channelId: 'drive-new', resourceId: 'res-new', expiration: Date.now() + 999999 });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(mockedDelete).toHaveBeenCalledWith('drive-1');
    expect(mockedSetupDrive).toHaveBeenCalledWith('https://example.com/api/webhook-drive', 'photos-folder');
    expect(json.created).toBe(1);
  });

  it('does not create a duplicate when a renewal for that folder failed', async () => {
    mockedExpected.mockReturnValue([
      { webhookUrl: 'https://example.com/api/webhook-drive', folderId: 'folder-1' },
    ]);
    mockedGetChannels.mockResolvedValue([driveChannel({ expiration: Date.now() + 60 * 1000 })] as never);
    mockedSetupDrive.mockRejectedValue(new Error('drive down'));

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(mockedSetupDrive).toHaveBeenCalledTimes(1);
    expect(json.failed).toBe(1);
    expect(json.created).toBe(0);
  });

  it('fails and alerts when a missing webhook cannot be created', async () => {
    mockedExpected.mockReturnValue([
      { webhookUrl: 'https://example.com/api/webhook-drive', folderId: 'photos-folder' },
    ]);
    mockedGetChannels.mockResolvedValue([] as never);
    mockedSetupDrive.mockRejectedValue(new Error('forbidden'));

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(json.failed).toBe(1);
    expect(json.success).toBe(false);
    expect(mockedAlert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'renewal_failed', message: expect.stringContaining('photos-folder') })
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

describe('Sentry cron monitoring for renew-drive-webhooks', () => {
  function cronRequest() {
    return makeRequest({ 'user-agent': 'vercel-cron/1.0' });
  }

  it('checks in ok when every webhook is healthy', async () => {
    mockedGetChannels.mockResolvedValue([] as never);
    await GET(cronRequest());
    expect(checkIns).toEqual([{ slug: 'renew-drive-webhooks', status: 'ok' }]);
  });

  it('checks in as failed when a renewal fails, even though the response is a 200', async () => {
    mockedExpected.mockReturnValue([
      { webhookUrl: 'https://example.com/api/webhook-drive', folderId: 'photos-folder' },
    ]);
    mockedGetChannels.mockResolvedValue([] as never);
    mockedSetupDrive.mockRejectedValue(new Error('forbidden'));

    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(false);
    expect(checkIns).toEqual([{ slug: 'renew-drive-webhooks', status: 'error' }]);
  });
});
