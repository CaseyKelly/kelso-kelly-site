import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { sql, upsertWebhookChannel, logSync } from '@/lib/db';
import { stopWatchingCalendar } from '@/lib/google-calendar';
import { stopWatchingFolder } from '@/lib/google-drive';
import { sendWebhookAlert } from '@/lib/notifications';
import { renewWebhooks } from '@/lib/webhooks';

// This is an integration test for the duplicate-channel-detection algorithm
// that lives inline in the route handler (not in src/lib/webhooks.ts, which
// already has its own unit tests) - it runs against the real webhook_channels
// table via the neon HTTP bridge (see vitest.integration.config.ts) so the
// "keep the later-expiring duplicate" logic is exercised against real rows,
// not a mock. Google/email side effects are mocked; renewWebhooks itself
// (separately unit-tested) is mocked too so this test stays focused on dedup.
vi.mock('@/lib/google-calendar', () => ({ stopWatchingCalendar: vi.fn() }));
vi.mock('@/lib/google-drive', () => ({ stopWatchingFolder: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ sendWebhookAlert: vi.fn() }));
vi.mock('@/lib/webhooks', () => ({ renewWebhooks: vi.fn() }));

const mockedStopCalendar = vi.mocked(stopWatchingCalendar);
const mockedStopFolder = vi.mocked(stopWatchingFolder);
const mockedAlert = vi.mocked(sendWebhookAlert);
const mockedRenew = vi.mocked(renewWebhooks);

const TABLES = ['events', 'photos', 'videos', 'sync_log', 'webhook_channels', 'youtube_uploads'];

beforeEach(async () => {
  await sql.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`, []);
  mockedStopCalendar.mockReset().mockResolvedValue(undefined);
  mockedStopFolder.mockReset().mockResolvedValue(undefined);
  mockedAlert.mockReset().mockResolvedValue(undefined);
  mockedRenew.mockReset().mockResolvedValue({ renewed: [], failed: [] });
  delete process.env.CRON_SECRET;
});

function makeRequest() {
  return new NextRequest('http://localhost/api/cron/renew-webhooks');
}

describe('GET /api/cron/renew-webhooks - duplicate channel cleanup', () => {
  it('keeps the later-expiring calendar channel and deletes the earlier duplicate', async () => {
    await upsertWebhookChannel({
      channel_id: 'cal-early',
      resource_type: 'calendar',
      resource_id: 'res-1',
      expiration: Date.now() + 1000,
    });
    await upsertWebhookChannel({
      channel_id: 'cal-late',
      resource_type: 'calendar',
      resource_id: 'res-2',
      expiration: Date.now() + 999999,
    });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(json.duplicatesCleaned).toBe(1);
    expect(mockedStopCalendar).toHaveBeenCalledWith('cal-early', 'res-1');

    const remaining = await sql`SELECT channel_id FROM webhook_channels WHERE resource_type = 'calendar'`;
    expect(remaining).toEqual([{ channel_id: 'cal-late' }]);
  });

  it('does not treat calendar and drive channels as duplicates of each other', async () => {
    await upsertWebhookChannel({
      channel_id: 'cal-1',
      resource_type: 'calendar',
      resource_id: 'res-1',
      expiration: Date.now() + 1000,
    });
    await upsertWebhookChannel({
      channel_id: 'drive-1',
      resource_type: 'drive',
      resource_id: 'res-2',
      expiration: Date.now() + 1000,
      webhook_url: 'https://example.com/api/webhook-drive',
      folder_id: 'folder-1',
    });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(json.duplicatesCleaned).toBe(0);
    const remaining = await sql`SELECT channel_id FROM webhook_channels ORDER BY channel_id`;
    expect(remaining).toEqual([{ channel_id: 'cal-1' }, { channel_id: 'drive-1' }]);
  });

  it('does not treat Drive channels for different folders (photos vs videos) as duplicates', async () => {
    await upsertWebhookChannel({ channel_id: 'drive-photos', resource_type: 'drive', resource_id: 'r1', expiration: Date.now() + 1000, webhook_url: 'https://x/api/webhook-drive', folder_id: 'photos-folder' });
    await upsertWebhookChannel({ channel_id: 'drive-videos', resource_type: 'drive', resource_id: 'r2', expiration: Date.now() + 999999, webhook_url: 'https://x/api/webhook-drive-videos', folder_id: 'videos-folder' });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(json.duplicatesCleaned).toBe(0);
    expect(mockedStopFolder).not.toHaveBeenCalled();
    const remaining = await sql`SELECT channel_id FROM webhook_channels ORDER BY channel_id`;
    expect(remaining).toEqual([{ channel_id: 'drive-photos' }, { channel_id: 'drive-videos' }]);
  });

  it('sends an alert when duplicates are cleaned up', async () => {
    await upsertWebhookChannel({ channel_id: 'drive-early', resource_type: 'drive', resource_id: 'r1', expiration: Date.now() + 1000, webhook_url: 'https://x/api/webhook-drive', folder_id: 'f1' });
    await upsertWebhookChannel({ channel_id: 'drive-late', resource_type: 'drive', resource_id: 'r2', expiration: Date.now() + 999999, webhook_url: 'https://x/api/webhook-drive', folder_id: 'f1' });

    await GET(makeRequest());

    expect(mockedAlert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'duplicate_detected' })
    );
    expect(mockedStopFolder).toHaveBeenCalledWith('drive-early', 'r1');
  });

  it('deletes the duplicate row even when stopping it on Google fails', async () => {
    await upsertWebhookChannel({ channel_id: 'cal-early', resource_type: 'calendar', resource_id: 'r1', expiration: Date.now() + 1000 });
    await upsertWebhookChannel({ channel_id: 'cal-late', resource_type: 'calendar', resource_id: 'r2', expiration: Date.now() + 999999 });
    mockedStopCalendar.mockRejectedValue(new Error('already expired'));

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(json.duplicatesCleaned).toBe(1);
    const remaining = await sql`SELECT channel_id FROM webhook_channels`;
    expect(remaining).toEqual([{ channel_id: 'cal-late' }]);
  });

  it('cleans up old sync logs and reports the count', async () => {
    await logSync({ sync_type: 'calendar', status: 'success', message: 'recent' });
    await sql`INSERT INTO sync_log (sync_type, status, message, synced_at) VALUES ('calendar', 'success', 'ancient', NOW() - INTERVAL '31 days')`;

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(json.syncLogsDeleted).toBe(1);
    const remaining = await sql`SELECT message FROM sync_log`;
    expect(remaining).toEqual([{ message: 'recent' }]);
  });

  it('rejects an incorrect CRON_SECRET bearer token', async () => {
    process.env.CRON_SECRET = 'super-secret';
    const request = new NextRequest('http://localhost/api/cron/renew-webhooks', {
      headers: { authorization: 'Bearer wrong' },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
