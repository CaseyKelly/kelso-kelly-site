import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renewWebhooks, cleanupAllWebhooks, initializeWebhooks, getExpectedDriveWebhooks } from './webhooks';
import { watchCalendar, stopWatchingCalendar } from './google-calendar';
import { watchFolder, stopWatchingFolder } from './google-drive';
import { upsertWebhookChannel, getWebhookChannels, deleteWebhookChannel } from './db';

vi.mock('./google-calendar', () => ({
  watchCalendar: vi.fn(),
  stopWatchingCalendar: vi.fn(),
}));
vi.mock('./google-drive', () => ({
  watchFolder: vi.fn(),
  stopWatchingFolder: vi.fn(),
}));
vi.mock('./db', () => ({
  upsertWebhookChannel: vi.fn(),
  getWebhookChannels: vi.fn(),
  deleteWebhookChannel: vi.fn(),
}));

const mocked = {
  watchCalendar: vi.mocked(watchCalendar),
  stopWatchingCalendar: vi.mocked(stopWatchingCalendar),
  watchFolder: vi.mocked(watchFolder),
  stopWatchingFolder: vi.mocked(stopWatchingFolder),
  upsertWebhookChannel: vi.mocked(upsertWebhookChannel),
  getWebhookChannels: vi.mocked(getWebhookChannels),
  deleteWebhookChannel: vi.mocked(deleteWebhookChannel),
};

function makeChannel(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    channel_id: 'calendar-123',
    resource_type: 'calendar' as const,
    resource_id: 'res-123',
    expiration: Date.now() + 1000,
    webhook_url: 'https://example.com/api/webhook-calendar',
    folder_id: null,
    last_renewed_at: new Date(),
    renewal_failures: 0,
    created_at: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_CALENDAR_ID = 'test-calendar-id';
  mocked.upsertWebhookChannel.mockResolvedValue([] as never);
  mocked.deleteWebhookChannel.mockResolvedValue([] as never);
  // Reset to success-by-default each test; individual tests override with
  // mockRejectedValue/mockImplementation as needed. clearAllMocks() only
  // clears call history, not implementations set by a previous test, so
  // without this a rejection configured in one test would leak into the next.
  mocked.stopWatchingCalendar.mockResolvedValue(undefined as never);
  mocked.stopWatchingFolder.mockResolvedValue(undefined as never);
  mocked.watchCalendar.mockResolvedValue({ channelId: 'default-cal', resourceId: 'default-res', expiration: Date.now() + 1000 });
  mocked.watchFolder.mockResolvedValue({ channelId: 'default-drive', resourceId: 'default-res', expiration: Date.now() + 1000 });
});

describe('renewWebhooks', () => {
  it('skips Drive channels entirely (handled by a dedicated cron)', async () => {
    mocked.getWebhookChannels.mockResolvedValue([
      makeChannel({ resource_type: 'drive', expiration: Date.now() - 1000 }),
    ] as never);

    const result = await renewWebhooks('https://example.com');

    expect(mocked.stopWatchingCalendar).not.toHaveBeenCalled();
    expect(mocked.watchCalendar).not.toHaveBeenCalled();
    expect(result).toEqual({ renewed: [], failed: [] });
  });

  it('does not renew a calendar channel that is not close to expiring', async () => {
    mocked.getWebhookChannels.mockResolvedValue([
      makeChannel({ expiration: Date.now() + 48 * 60 * 60 * 1000 }),
    ] as never);

    const result = await renewWebhooks('https://example.com');

    expect(mocked.watchCalendar).not.toHaveBeenCalled();
    expect(result).toEqual({ renewed: [], failed: [] });
  });

  it('renews a calendar channel expiring within 24h: stop old, create new, then delete old record', async () => {
    const callOrder: string[] = [];
    mocked.getWebhookChannels.mockResolvedValue([
      makeChannel({ channel_id: 'calendar-old', expiration: Date.now() + 60 * 1000 }),
    ] as never);
    mocked.stopWatchingCalendar.mockImplementation(async () => {
      callOrder.push('stop');
    });
    mocked.watchCalendar.mockImplementation(async () => {
      callOrder.push('create');
      return { channelId: 'calendar-new', resourceId: 'res-new', expiration: Date.now() + 1000 };
    });
    mocked.deleteWebhookChannel.mockImplementation(async () => {
      callOrder.push('delete');
      return [] as never;
    });

    const result = await renewWebhooks('https://example.com');

    expect(callOrder).toEqual(['stop', 'create', 'delete']);
    expect(mocked.deleteWebhookChannel).toHaveBeenCalledWith('calendar-old');
    expect(result.renewed).toEqual(['calendar-old']);
  });

  it('continues renewal even if stopping the old channel fails (already-expired channel)', async () => {
    mocked.getWebhookChannels.mockResolvedValue([
      makeChannel({ channel_id: 'calendar-old', expiration: Date.now() + 60 * 1000 }),
    ] as never);
    mocked.stopWatchingCalendar.mockRejectedValue(new Error('404 channel not found'));
    mocked.watchCalendar.mockResolvedValue({
      channelId: 'calendar-new',
      resourceId: 'res-new',
      expiration: Date.now() + 1000,
    });

    const result = await renewWebhooks('https://example.com');

    expect(mocked.watchCalendar).toHaveBeenCalled();
    expect(result.renewed).toEqual(['calendar-old']);
  });

  it('leaves the old DB record in place for retry when creating the new webhook fails', async () => {
    mocked.getWebhookChannels.mockResolvedValue([
      makeChannel({ channel_id: 'calendar-old', expiration: Date.now() + 60 * 1000 }),
    ] as never);
    mocked.watchCalendar.mockRejectedValue(new Error('Google API quota exceeded'));

    const result = await renewWebhooks('https://example.com');

    expect(mocked.deleteWebhookChannel).not.toHaveBeenCalled();
    expect(result.failed).toEqual(['calendar-old']);
    expect(result.renewed).toEqual([]);
  });
});

describe('cleanupAllWebhooks', () => {
  it('stops and deletes both calendar and drive channels', async () => {
    mocked.getWebhookChannels.mockResolvedValue([
      makeChannel({ channel_id: 'cal-1', resource_type: 'calendar' }),
      makeChannel({ channel_id: 'drive-1', resource_type: 'drive' }),
    ] as never);

    const result = await cleanupAllWebhooks();

    expect(mocked.stopWatchingCalendar).toHaveBeenCalledWith('cal-1', 'res-123');
    expect(mocked.stopWatchingFolder).toHaveBeenCalledWith('drive-1', 'res-123');
    expect(result).toEqual({ stopped: 2, failed: 0, deleted: 2 });
  });

  it('still deletes the DB record even when stopping the remote channel fails', async () => {
    mocked.getWebhookChannels.mockResolvedValue([makeChannel({ channel_id: 'cal-1' })] as never);
    mocked.stopWatchingCalendar.mockRejectedValue(new Error('already gone'));

    const result = await cleanupAllWebhooks();

    expect(mocked.deleteWebhookChannel).toHaveBeenCalledWith('cal-1');
    expect(result).toEqual({ stopped: 0, failed: 1, deleted: 1 });
  });
});

describe('initializeWebhooks', () => {
  it('aggregates per-service failures instead of failing fast', async () => {
    delete process.env.GOOGLE_DRIVE_VIDEOS_FOLDER_ID;
    process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID = 'photos-folder';
    mocked.getWebhookChannels.mockResolvedValue([]);
    mocked.watchCalendar.mockRejectedValue(new Error('calendar setup failed'));
    mocked.watchFolder.mockResolvedValue({
      channelId: 'drive-1',
      resourceId: 'res-1',
      expiration: Date.now() + 1000,
    });

    const result = await initializeWebhooks('https://example.com');

    expect(result.errors).toEqual(['Calendar: Error: calendar setup failed']);
    expect(result.drivePhotos).not.toBeNull();
  });

  it('skips the drive-videos webhook (without error) when its folder ID is not configured', async () => {
    delete process.env.GOOGLE_DRIVE_VIDEOS_FOLDER_ID;
    process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID = 'photos-folder';
    mocked.getWebhookChannels.mockResolvedValue([]);
    mocked.watchCalendar.mockResolvedValue({ channelId: 'c', resourceId: 'r', expiration: 1 });
    mocked.watchFolder.mockResolvedValue({ channelId: 'd', resourceId: 'r', expiration: 1 });

    const result = await initializeWebhooks('https://example.com');

    expect(result.driveVideos).toBeNull();
    expect(result.errors).toEqual([]);
    // watchFolder only called once, for photos
    expect(mocked.watchFolder).toHaveBeenCalledTimes(1);
  });

  it('cleans up existing webhooks before setting up new ones', async () => {
    mocked.getWebhookChannels.mockResolvedValue([makeChannel({ channel_id: 'stale' })] as never);
    process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID = 'photos-folder';
    mocked.watchCalendar.mockResolvedValue({ channelId: 'c', resourceId: 'r', expiration: 1 });
    mocked.watchFolder.mockResolvedValue({ channelId: 'd', resourceId: 'r', expiration: 1 });

    const result = await initializeWebhooks('https://example.com');

    expect(mocked.deleteWebhookChannel).toHaveBeenCalledWith('stale');
    expect(result.cleanup.deleted).toBe(1);
  });
});

describe('getExpectedDriveWebhooks', () => {
  beforeEach(() => {
    delete process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID;
    delete process.env.GOOGLE_DRIVE_VIDEOS_FOLDER_ID;
  });

  it('lists a webhook for each configured Drive folder', () => {
    process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID = 'photos-folder';
    process.env.GOOGLE_DRIVE_VIDEOS_FOLDER_ID = 'videos-folder';

    expect(getExpectedDriveWebhooks('https://example.com')).toEqual([
      { webhookUrl: 'https://example.com/api/webhook-drive', folderId: 'photos-folder' },
      { webhookUrl: 'https://example.com/api/webhook-drive-videos', folderId: 'videos-folder' },
    ]);
  });

  it('omits folders that are not configured', () => {
    process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID = 'photos-folder';

    expect(getExpectedDriveWebhooks('https://example.com')).toEqual([
      { webhookUrl: 'https://example.com/api/webhook-drive', folderId: 'photos-folder' },
    ]);
  });
});
