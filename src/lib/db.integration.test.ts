import { describe, it, expect, beforeEach } from 'vitest';
import {
  sql,
  upsertEvent,
  upsertPhoto,
  upsertVideo,
  getEventIds,
  getPhotoIds,
  getVideoUrls,
  getUpcomingEvents,
  getPastEvents,
  getLastSuccessfulSync,
  logSync,
} from './db';

const TABLES = ['events', 'photos', 'videos', 'sync_log', 'webhook_channels', 'youtube_uploads'];

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
    expect(new Date(second.event.updated_at).getTime()).toBeGreaterThan(
      new Date(first.event.updated_at).getTime()
    );
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
