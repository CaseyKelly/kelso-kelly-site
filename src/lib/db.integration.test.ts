import { describe, it, expect, beforeEach } from 'vitest';
import {
  sql,
  upsertEvent,
  upsertPhoto,
  updatePhotosMetadata,
  upsertVideo,
  getEventIds,
  getPhotoIds,
  getPhotoImageDataByDriveId,
  getVideoUrls,
  getUpcomingEvents,
  getPastEvents,
  getLastSuccessfulSync,
  logSync,
  upsertWebhookChannel,
  isKnownWebhookChannel,
  incrementContactRateLimit,
} from './db';

const TABLES = ['events', 'photos', 'videos', 'sync_log', 'webhook_channels', 'youtube_uploads', 'contact_rate_limits'];

beforeEach(async () => {
  await sql.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`, []);
});

describe('upsertEvent', () => {
  const baseEvent = {
    google_event_id: 'evt-1',
    title: 'Live at The Aggie',
    date: '2026-08-15',
    time: '7:00 PM',
    venue: 'The Aggie Theatre',
    address: '204 S College Ave',
    description: 'A great show',
    ticket_url: 'https://example.com/tickets',
  };

  it('reports "created" on first insert', async () => {
    const result = await upsertEvent(baseEvent);
    expect(result.action).toBe('created');
    expect(result.event.google_event_id).toBe('evt-1');
    expect(result.event.title).toBe('Live at The Aggie');
  });

  it('reports "unchanged" and does not touch updated_at when re-upserting identical data', async () => {
    const first = await upsertEvent(baseEvent);
    const firstUpdatedAt = new Date(first.event.updated_at).getTime();

    // ensure a real clock tick has occurred so a false "unchanged" couldn't
    // be masked by NOW() rounding to the same value anyway
    await new Promise((r) => setTimeout(r, 20));

    const second = await upsertEvent({ ...baseEvent });
    expect(second.action).toBe('unchanged');
    expect(new Date(second.event.updated_at).getTime()).toBe(firstUpdatedAt);
  });

  it('reports "updated" when a field changes, and does update updated_at', async () => {
    const first = await upsertEvent(baseEvent);
    await new Promise((r) => setTimeout(r, 20));

    const second = await upsertEvent({ ...baseEvent, title: 'Live at The Aggie (Rescheduled)' });
    expect(second.action).toBe('updated');
    expect(second.event.title).toBe('Live at The Aggie (Rescheduled)');
    expect(new Date(second.event.updated_at).getTime()).toBeGreaterThan(new Date(first.event.updated_at).getTime());
  });

  it('treats a null-to-value change on an optional field as a change', async () => {
    await upsertEvent({ ...baseEvent, venue: null });
    const second = await upsertEvent({ ...baseEvent, venue: 'The Aggie Theatre' });
    expect(second.action).toBe('updated');
    expect(second.event.venue).toBe('The Aggie Theatre');
  });
});

describe('upsertPhoto', () => {
  const basePhoto = {
    google_drive_id: 'photo-1',
    title: 'Live Performance',
    category: 'performance' as const,
    alt_text: 'Kelso performing live',
    optimized_url: 'https://blob.example.com/photo-1.webp',
    width: 1920,
    height: 1080,
    order_index: 0,
  };

  it('classifies created / unchanged / updated correctly across repeated upserts', async () => {
    const created = await upsertPhoto(basePhoto);
    expect(created.action).toBe('created');

    const unchanged = await upsertPhoto({ ...basePhoto });
    expect(unchanged.action).toBe('unchanged');

    const updated = await upsertPhoto({ ...basePhoto, order_index: 5 });
    expect(updated.action).toBe('updated');
    expect(updated.photo.order_index).toBe(5);
  });
});

describe('upsertVideo', () => {
  const baseVideo = {
    title: 'Live at The Aggie',
    youtube_url: 'https://youtu.be/dQw4w9WgXcQ',
    thumbnail_url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
    description: 'Full set',
    category: 'live' as const,
    order_index: 0,
  };

  it('classifies created / unchanged / updated correctly across repeated upserts', async () => {
    const created = await upsertVideo(baseVideo);
    expect(created.action).toBe('created');

    const unchanged = await upsertVideo({ ...baseVideo });
    expect(unchanged.action).toBe('unchanged');

    const updated = await upsertVideo({ ...baseVideo, title: 'Live at The Aggie (Full Set)' });
    expect(updated.action).toBe('updated');
    expect(updated.video.title).toBe('Live at The Aggie (Full Set)');
  });
});

describe('id/URL set getters used for sync diffing', () => {
  it('getEventIds/getPhotoIds/getVideoUrls return the right members after inserts', async () => {
    await upsertEvent({
      google_event_id: 'evt-a',
      title: 'A',
      date: '2026-08-15',
      time: '7:00 PM',
    });
    await upsertPhoto({
      google_drive_id: 'photo-a',
      title: 'A',
      category: 'performance',
      optimized_url: 'https://blob.example.com/a.webp',
    });
    await upsertVideo({ title: 'A', youtube_url: 'https://youtu.be/a' });

    expect(await getEventIds()).toEqual(new Set(['evt-a']));
    expect(await getPhotoIds()).toEqual(new Set(['photo-a']));
    expect(await getVideoUrls()).toEqual(new Set(['https://youtu.be/a']));
  });

  it('getPhotoImageDataByDriveId maps each Drive ID to its stored image data', async () => {
    await upsertPhoto({
      google_drive_id: 'photo-a',
      title: 'A',
      category: 'performance',
      optimized_url: 'https://blob.example.com/a.webp',
      width: 1920,
      height: 1080,
    });
    await upsertPhoto({
      google_drive_id: 'photo-b',
      title: 'B',
      category: 'performance',
      optimized_url: 'https://blob.example.com/b.webp',
    });

    expect(await getPhotoImageDataByDriveId()).toEqual(
      new Map([
        ['photo-a', { optimized_url: 'https://blob.example.com/a.webp', width: 1920, height: 1080 }],
        ['photo-b', { optimized_url: 'https://blob.example.com/b.webp', width: null, height: null }],
      ])
    );
  });
});

describe('updatePhotosMetadata', () => {
  const insertPhoto = (id: string, order_index: number) =>
    upsertPhoto({
      google_drive_id: id,
      title: id,
      category: 'performance',
      alt_text: id,
      optimized_url: `https://blob.example.com/${id}.webp`,
      width: 800,
      height: 600,
      order_index,
    });

  it('updates only changed rows in one call, preserving image data and updated_at of unchanged rows', async () => {
    await insertPhoto('photo-a', 0);
    await insertPhoto('photo-b', 1);
    const [before] = await sql`SELECT updated_at FROM photos WHERE google_drive_id = 'photo-a'`;
    await new Promise((r) => setTimeout(r, 20));

    const updated = await updatePhotosMetadata([
      { google_drive_id: 'photo-a', title: 'photo-a', category: 'performance', alt_text: 'photo-a', order_index: 0 },
      { google_drive_id: 'photo-b', title: 'Renamed', category: 'performance', alt_text: null, order_index: 5 },
      { google_drive_id: 'not-in-db', title: 'Ghost', category: 'performance', alt_text: null, order_index: 2 },
    ]);

    expect(updated).toEqual(new Set(['photo-b']));

    const rows = await sql`SELECT * FROM photos ORDER BY google_drive_id`;
    expect(rows).toHaveLength(2);
    expect(new Date(rows[0].updated_at).getTime()).toBe(new Date(before.updated_at).getTime());
    expect(rows[1]).toMatchObject({
      title: 'Renamed',
      alt_text: null,
      order_index: 5,
      optimized_url: 'https://blob.example.com/photo-b.webp',
      width: 800,
      height: 600,
    });
  });

  it('is a no-op for an empty list', async () => {
    expect(await updatePhotosMetadata([])).toEqual(new Set());
  });
});

describe('date-boundary event queries', () => {
  beforeEach(async () => {
    await upsertEvent({ google_event_id: 'past-1', title: 'Past Show', date: '2020-01-01', time: '7:00 PM' });
    await upsertEvent({ google_event_id: 'future-1', title: 'Future Show', date: '2099-01-01', time: '7:00 PM' });
  });

  it('getUpcomingEvents only returns events on/after today', async () => {
    const upcoming = await getUpcomingEvents();
    expect(upcoming.map((e) => e.google_event_id)).toEqual(['future-1']);
  });

  it('getPastEvents only returns events before today, most recent first, respecting the limit', async () => {
    await upsertEvent({ google_event_id: 'past-2', title: 'Older Show', date: '2019-01-01', time: '7:00 PM' });
    const past = await getPastEvents(1);
    expect(past.map((e) => e.google_event_id)).toEqual(['past-1']);
  });
});

describe('getLastSuccessfulSync', () => {
  it('returns null when there is no successful sync logged', async () => {
    await logSync({ sync_type: 'calendar', status: 'error', message: 'boom' });
    expect(await getLastSuccessfulSync('calendar')).toBeNull();
  });

  it('returns the most recent successful sync time, ignoring errors and other sync types', async () => {
    await logSync({ sync_type: 'calendar', status: 'success', message: 'first' });
    await logSync({ sync_type: 'photos', status: 'success', message: 'other type' });
    await logSync({ sync_type: 'calendar', status: 'error', message: 'a failure after success' });

    const lastSync = await getLastSuccessfulSync('calendar');
    expect(lastSync).not.toBeNull();
    expect(lastSync!.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('isKnownWebhookChannel', () => {
  beforeEach(async () => {
    await upsertWebhookChannel({
      channel_id: 'calendar-1',
      resource_type: 'calendar',
      resource_id: 'res-cal',
      expiration: Date.now() + 60_000,
    });
  });

  it('accepts a notification whose channel, resource, and type all match a stored channel', async () => {
    expect(await isKnownWebhookChannel('calendar-1', 'res-cal', 'calendar')).toBe(true);
  });

  it('rejects a known channel ID paired with the wrong resource ID', async () => {
    expect(await isKnownWebhookChannel('calendar-1', 'forged', 'calendar')).toBe(false);
  });

  it('rejects a calendar channel presented to a Drive webhook', async () => {
    expect(await isKnownWebhookChannel('calendar-1', 'res-cal', 'drive')).toBe(false);
  });

  it('rejects an unknown channel ID', async () => {
    expect(await isKnownWebhookChannel('nope', 'res-cal', 'calendar')).toBe(false);
  });
});

describe('incrementContactRateLimit', () => {
  it('starts a window at 1 and counts up within it', async () => {
    const first = await incrementContactRateLimit('203.0.113.1', 3600);
    expect(first.count).toBe(1);
    expect(first.retryAfterSeconds).toBeGreaterThan(3590);
    expect(first.retryAfterSeconds).toBeLessThanOrEqual(3600);

    const second = await incrementContactRateLimit('203.0.113.1', 3600);
    expect(second.count).toBe(2);
  });

  it('counts each IP separately', async () => {
    await incrementContactRateLimit('203.0.113.1', 3600);
    await incrementContactRateLimit('203.0.113.1', 3600);
    const other = await incrementContactRateLimit('203.0.113.2', 3600);
    expect(other.count).toBe(1);
  });

  it('resets the count once the window has expired', async () => {
    await incrementContactRateLimit('203.0.113.1', 3600);
    await incrementContactRateLimit('203.0.113.1', 3600);
    await sql`UPDATE contact_rate_limits SET window_start = NOW() - INTERVAL '2 hours' WHERE ip = '203.0.113.1'`;

    const afterReset = await incrementContactRateLimit('203.0.113.1', 3600);
    expect(afterReset.count).toBe(1);
    expect(afterReset.retryAfterSeconds).toBeGreaterThan(3590);
  });

  it('counts concurrent requests atomically', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => incrementContactRateLimit('203.0.113.3', 3600)));
    expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
