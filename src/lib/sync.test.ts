import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncCalendarEvents, syncPhotos, syncVideos } from './sync';
import { fetchAllCalendarEvents } from './google-calendar';
import { listImageFilesInFolder, downloadFile } from './google-drive';
import { fetchVideosFromSheetWithThumbnails } from './google-sheets';
import { optimizeImage, UnsupportedFormatError } from './image-optimizer';
import {
  sql,
  upsertEvent,
  upsertPhoto,
  updatePhotosMetadata,
  upsertVideo,
  deletePhoto,
  deleteEvent,
  logSync,
  getEventIds,
  getPhotoImageDataByDriveId,
  getVideoUrls,
} from './db';
import { put, del } from '@vercel/blob';
import { shouldSync } from './sync-throttle';

vi.mock('./google-calendar', () => ({
  fetchAllCalendarEvents: vi.fn(),
}));
vi.mock('./google-drive', () => ({
  listImageFilesInFolder: vi.fn(),
  downloadFile: vi.fn(),
  getCategoryFromFolderName: vi.fn(),
  cleanFilenameForTitle: vi.fn((name: string) => name),
  findFolderByName: vi.fn(),
}));
vi.mock('./google-sheets', () => ({
  fetchVideosFromSheetWithThumbnails: vi.fn(),
}));
vi.mock('./image-optimizer', async () => {
  const actual = await vi.importActual<typeof import('./image-optimizer')>('./image-optimizer');
  return {
    ...actual,
    optimizeImage: vi.fn(),
  };
});
vi.mock('./db', () => ({
  sql: vi.fn().mockResolvedValue([]),
  upsertEvent: vi.fn(),
  upsertPhoto: vi.fn(),
  updatePhotosMetadata: vi.fn().mockResolvedValue(new Set()),
  upsertVideo: vi.fn(),
  deleteVideo: vi.fn(),
  deletePhoto: vi.fn(),
  deleteEvent: vi.fn(),
  deleteAllVideos: vi.fn(),
  logSync: vi.fn(),
  getEvents: vi.fn(),
  getPhotos: vi.fn(),
  getVideos: vi.fn(),
  getEventIds: vi.fn(),
  getPhotoImageDataByDriveId: vi.fn(),
  getVideoUrls: vi.fn(),
}));
vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
  del: vi.fn(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));
vi.mock('./sync-throttle', () => ({
  shouldSync: vi.fn(),
}));

const mocked = {
  fetchAllCalendarEvents: vi.mocked(fetchAllCalendarEvents),
  listImageFilesInFolder: vi.mocked(listImageFilesInFolder),
  downloadFile: vi.mocked(downloadFile),
  fetchVideosFromSheetWithThumbnails: vi.mocked(fetchVideosFromSheetWithThumbnails),
  optimizeImage: vi.mocked(optimizeImage),
  sql: vi.mocked(sql),
  upsertEvent: vi.mocked(upsertEvent),
  upsertPhoto: vi.mocked(upsertPhoto),
  updatePhotosMetadata: vi.mocked(updatePhotosMetadata),
  upsertVideo: vi.mocked(upsertVideo),
  deletePhoto: vi.mocked(deletePhoto),
  deleteEvent: vi.mocked(deleteEvent),
  logSync: vi.mocked(logSync),
  getEventIds: vi.mocked(getEventIds),
  getPhotoImageDataByDriveId: vi.mocked(getPhotoImageDataByDriveId),
  getVideoUrls: vi.mocked(getVideoUrls),
  put: vi.mocked(put),
  del: vi.mocked(del),
  shouldSync: vi.mocked(shouldSync),
};

function makeEvent(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    title: `Event ${id}`,
    date: '2026-08-15',
    time: '7:00 PM',
    venue: 'The Aggie',
    address: undefined,
    description: undefined,
    ticketUrl: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.shouldSync.mockResolvedValue(true);
  mocked.logSync.mockResolvedValue([] as never);
  process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID = 'test-photos-folder';
  process.env.GOOGLE_VIDEOS_SHEET_ID = 'test-sheet-id';
});

describe('syncCalendarEvents', () => {
  it('returns a throttled result without fetching when shouldSync is false', async () => {
    mocked.shouldSync.mockResolvedValue(false);

    const result = await syncCalendarEvents();

    expect(result).toEqual({
      success: true,
      message: 'Calendar sync throttled (recent sync)',
      details: { throttled: true },
    });
    expect(mocked.fetchAllCalendarEvents).not.toHaveBeenCalled();
  });

  it('bypasses throttling entirely when force=true', async () => {
    mocked.fetchAllCalendarEvents.mockResolvedValue([]);
    mocked.getEventIds.mockResolvedValue(new Set());

    await syncCalendarEvents(true);

    expect(mocked.shouldSync).not.toHaveBeenCalled();
  });

  it('classifies created, updated, and unchanged events from upsert results', async () => {
    mocked.fetchAllCalendarEvents.mockResolvedValue([
      makeEvent('created-1'),
      makeEvent('updated-1'),
      makeEvent('unchanged-1'),
    ]);
    mocked.getEventIds.mockResolvedValue(new Set(['updated-1', 'unchanged-1']));
    mocked.upsertEvent
      .mockResolvedValueOnce({ action: 'created', event: {} as never })
      .mockResolvedValueOnce({ action: 'updated', event: {} as never })
      .mockResolvedValueOnce({ action: 'unchanged', event: {} as never });

    const result = await syncCalendarEvents();

    expect(result.success).toBe(true);
    expect(result.details).toMatchObject({ created: 1, updated: 1, unchanged: 1, deleted: 0 });
  });

  it('deletes events missing from the calendar when below the safety threshold', async () => {
    // 3 of 10 existing events are gone (30%, but count < 5) -> safe to delete
    const existing = new Set(Array.from({ length: 10 }, (_, i) => `evt-${i}`));
    mocked.getEventIds.mockResolvedValue(existing);
    mocked.fetchAllCalendarEvents.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => makeEvent(`evt-${i}`))
    );
    mocked.upsertEvent.mockResolvedValue({ action: 'unchanged', event: {} as never });

    const result = await syncCalendarEvents();

    expect(mocked.deleteEvent).toHaveBeenCalledTimes(3);
    expect(result.details!.deleted).toBe(3);
  });

  it('skips deletion when >=5 events AND >20% would be deleted (safety guard)', async () => {
    // 5 of 20 existing events gone = 25% and count >= 5 -> guarded
    const existing = new Set(Array.from({ length: 20 }, (_, i) => `evt-${i}`));
    mocked.getEventIds.mockResolvedValue(existing);
    mocked.fetchAllCalendarEvents.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => makeEvent(`evt-${i}`))
    );
    mocked.upsertEvent.mockResolvedValue({ action: 'unchanged', event: {} as never });

    const result = await syncCalendarEvents();

    expect(mocked.deleteEvent).not.toHaveBeenCalled();
    expect(result.details!.deleted).toBe(0);
    expect(result.message).toContain('Successfully synced');
  });

  it('does NOT guard at exactly the 20% boundary (guard requires >20%, not >=)', async () => {
    // 5 of 25 = exactly 20%, count >= 5 -> percentage>20 is false -> proceeds
    const existing = new Set(Array.from({ length: 25 }, (_, i) => `evt-${i}`));
    mocked.getEventIds.mockResolvedValue(existing);
    mocked.fetchAllCalendarEvents.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => makeEvent(`evt-${i}`))
    );
    mocked.upsertEvent.mockResolvedValue({ action: 'unchanged', event: {} as never });

    const result = await syncCalendarEvents();

    expect(mocked.deleteEvent).toHaveBeenCalledTimes(5);
    expect(result.details!.deleted).toBe(5);
  });

  it('allows deleting all events on a small cleanup even at 100% (count < 5 overrides percentage)', async () => {
    mocked.getEventIds.mockResolvedValue(new Set(['only-event']));
    mocked.fetchAllCalendarEvents.mockResolvedValue([]);

    const result = await syncCalendarEvents();

    expect(mocked.deleteEvent).toHaveBeenCalledWith('only-event');
    expect(result.details!.deleted).toBe(1);
  });

  it('does not attempt any deletion on the very first sync (no existing events)', async () => {
    mocked.getEventIds.mockResolvedValue(new Set());
    mocked.fetchAllCalendarEvents.mockResolvedValue([makeEvent('brand-new')]);
    mocked.upsertEvent.mockResolvedValue({ action: 'created', event: {} as never });

    const result = await syncCalendarEvents();

    expect(mocked.deleteEvent).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('returns a failure result and logs an error when fetching throws', async () => {
    mocked.fetchAllCalendarEvents.mockRejectedValue(new Error('Calendar API down'));

    const result = await syncCalendarEvents();

    expect(result.success).toBe(false);
    expect(result.message).toContain('Calendar API down');
    expect(mocked.logSync).toHaveBeenCalledWith(
      expect.objectContaining({ sync_type: 'calendar', status: 'error' })
    );
  });
});

describe('syncPhotos', () => {
  const driveFile = (id: string, overrides: Partial<Record<string, unknown>> = {}) => ({
    id,
    name: `${id}.jpg`,
    mimeType: 'image/jpeg',
    createdTime: '2026-01-01T00:00:00Z',
    modifiedTime: '2026-01-01T00:00:00Z',
    ...overrides,
  });

  it('throws and fails gracefully when GOOGLE_DRIVE_PHOTOS_FOLDER_ID is not configured', async () => {
    delete process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID;

    const result = await syncPhotos();

    expect(result.success).toBe(false);
    expect(result.message).toContain('GOOGLE_DRIVE_PHOTOS_FOLDER_ID');
  });

  it('downloads, optimizes, and uploads a new (non-HEIC) photo', async () => {
    mocked.listImageFilesInFolder.mockResolvedValue([driveFile('new-photo')]);
    mocked.getPhotoImageDataByDriveId.mockResolvedValue(new Map());
    mocked.downloadFile.mockResolvedValue(Buffer.from('fake-image-bytes'));
    mocked.optimizeImage.mockResolvedValue({
      buffer: Buffer.from('optimized'),
      width: 800,
      height: 600,
      format: 'webp',
      size: 9,
    });
    mocked.put.mockResolvedValue({ url: 'https://blob.example.com/new-photo.webp' } as never);
    mocked.upsertPhoto.mockResolvedValue({ action: 'created', photo: {} as never });

    const result = await syncPhotos();

    expect(mocked.downloadFile).toHaveBeenCalledWith('new-photo');
    expect(mocked.put).toHaveBeenCalled();
    expect(mocked.upsertPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ optimized_url: 'https://blob.example.com/new-photo.webp' })
    );
    expect(result.details!.created).toBe(1);
    expect(result.success).toBe(true);
  });

  it('downloads and optimizes HEIC files like any other photo instead of skipping them', async () => {
    mocked.listImageFilesInFolder.mockResolvedValue([
      driveFile('heic-photo', { name: 'heic-photo.heic', mimeType: 'image/heic' }),
    ]);
    mocked.getPhotoImageDataByDriveId.mockResolvedValue(new Map());
    mocked.downloadFile.mockResolvedValue(Buffer.from('heic-bytes'));
    mocked.optimizeImage.mockResolvedValue({
      buffer: Buffer.from('optimized'),
      width: 800,
      height: 600,
      format: 'webp',
      size: 9,
    });
    mocked.put.mockResolvedValue({ url: 'https://blob.example.com/heic-photo.webp' } as never);
    mocked.upsertPhoto.mockResolvedValue({ action: 'created', photo: {} as never });

    const result = await syncPhotos();

    expect(mocked.downloadFile).toHaveBeenCalledWith('heic-photo');
    expect(mocked.optimizeImage).toHaveBeenCalledWith(
      Buffer.from('heic-bytes'),
      expect.anything(),
      { filename: 'heic-photo.heic', mimeType: 'image/heic' }
    );
    expect(mocked.put).toHaveBeenCalledWith('photos/heic-photo.webp', expect.anything(), expect.anything());
    expect(result.details!.created).toBe(1);
    expect(result.details!.heicSkipped).toBe(0);
    expect(result.success).toBe(true);
  });

  it('treats a HEIC file that fails to decode (UnsupportedFormatError) as a skip, not an error', async () => {
    mocked.listImageFilesInFolder.mockResolvedValue([driveFile('bad-format')]);
    mocked.getPhotoImageDataByDriveId.mockResolvedValue(new Map());
    mocked.downloadFile.mockResolvedValue(Buffer.from('bytes'));
    mocked.optimizeImage.mockRejectedValue(new UnsupportedFormatError('HEIC'));

    const result = await syncPhotos();

    expect(result.details!.heicSkipped).toBe(1);
    expect(result.details!.errors).toBe(0);
    expect(result.success).toBe(true);
  });

  it('counts a generic processing error and continues with the remaining files', async () => {
    mocked.listImageFilesInFolder.mockResolvedValue([driveFile('broken'), driveFile('fine')]);
    mocked.getPhotoImageDataByDriveId.mockResolvedValue(new Map());
    mocked.downloadFile.mockResolvedValueOnce(Buffer.from('bad')).mockResolvedValueOnce(Buffer.from('good'));
    mocked.optimizeImage
      .mockRejectedValueOnce(new Error('sharp exploded'))
      .mockResolvedValueOnce({ buffer: Buffer.from('ok'), width: 10, height: 10, format: 'webp', size: 2 });
    mocked.put.mockResolvedValue({ url: 'https://blob.example.com/fine.webp' } as never);
    mocked.upsertPhoto.mockResolvedValue({ action: 'created', photo: {} as never });

    const result = await syncPhotos();

    expect(result.details!.errors).toBe(1);
    expect(result.details!.created).toBe(1);
    expect(result.success).toBe(false); // errorCount > 0
  });

  it('updates metadata for all existing photos in one batch, without re-processing their images', async () => {
    mocked.listImageFilesInFolder.mockResolvedValue([driveFile('existing-a'), driveFile('existing-b')]);
    mocked.getPhotoImageDataByDriveId.mockResolvedValue(new Map([
      ['existing-a', { optimized_url: 'https://blob.example.com/a.webp', width: 640, height: 480 }],
      ['existing-b', { optimized_url: 'https://blob.example.com/b.webp', width: 640, height: 480 }],
    ]));
    mocked.updatePhotosMetadata.mockResolvedValue(new Set(['existing-a']));

    const result = await syncPhotos();

    expect(mocked.downloadFile).not.toHaveBeenCalled();
    expect(mocked.optimizeImage).not.toHaveBeenCalled();
    expect(mocked.upsertPhoto).not.toHaveBeenCalled();
    expect(mocked.updatePhotosMetadata).toHaveBeenCalledTimes(1);
    expect(mocked.updatePhotosMetadata).toHaveBeenCalledWith([
      expect.objectContaining({ google_drive_id: 'existing-a', order_index: 0 }),
      expect.objectContaining({ google_drive_id: 'existing-b', order_index: 1 }),
    ]);
    expect(result.details!.updated).toBe(1);
    expect(result.details!.skipped).toBe(1);
  });

  it('counts every existing photo as an error when the batch metadata update fails', async () => {
    mocked.listImageFilesInFolder.mockResolvedValue([driveFile('existing-a'), driveFile('existing-b')]);
    mocked.getPhotoImageDataByDriveId.mockResolvedValue(new Map([
      ['existing-a', { optimized_url: 'https://blob.example.com/a.webp', width: 640, height: 480 }],
      ['existing-b', { optimized_url: 'https://blob.example.com/b.webp', width: 640, height: 480 }],
    ]));
    mocked.updatePhotosMetadata.mockRejectedValueOnce(new Error('db down'));

    const result = await syncPhotos();

    expect(result.success).toBe(false);
    expect(result.details!.errors).toBe(2);
  });

  it('deletes DB photos missing from Drive with no safety guard, even for a large proportion', async () => {
    // Documents current behavior: unlike calendar sync, photo deletion has no
    // count/percentage threshold - all 4 of 4 existing photos get deleted here.
    mocked.listImageFilesInFolder.mockResolvedValue([]);
    mocked.getPhotoImageDataByDriveId.mockResolvedValue(new Map(
      ['p1', 'p2', 'p3', 'p4'].map(id => [id, { optimized_url: `https://blob.example.com/${id}.webp`, width: 1, height: 1 }])
    ));

    const result = await syncPhotos();

    expect(mocked.deletePhoto).toHaveBeenCalledTimes(4);
    expect(result.details!.deleted).toBe(4);
  });

  it('deletes the blob for each photo removed from Drive', async () => {
    mocked.listImageFilesInFolder.mockResolvedValue([]);
    mocked.getPhotoImageDataByDriveId.mockResolvedValue(new Map([
      ['p1', { optimized_url: 'https://blob.example.com/p1.webp', width: 1, height: 1 }],
    ]));

    await syncPhotos();

    expect(mocked.deletePhoto).toHaveBeenCalledWith('p1');
    expect(mocked.del).toHaveBeenCalledWith('https://blob.example.com/p1.webp');
  });

  it('still counts the photo as deleted when the blob delete fails', async () => {
    mocked.listImageFilesInFolder.mockResolvedValue([]);
    mocked.getPhotoImageDataByDriveId.mockResolvedValue(new Map([
      ['p1', { optimized_url: 'https://blob.example.com/p1.webp', width: 1, height: 1 }],
    ]));
    mocked.del.mockRejectedValueOnce(new Error('blob store down'));

    const result = await syncPhotos();

    expect(result.success).toBe(true);
    expect(result.details!.deleted).toBe(1);
    expect(result.details!.errors).toBe(0);
  });
});

describe('syncVideos', () => {
  it('throws and fails gracefully when GOOGLE_VIDEOS_SHEET_ID is not configured', async () => {
    delete process.env.GOOGLE_VIDEOS_SHEET_ID;

    const result = await syncVideos();

    expect(result.success).toBe(false);
    expect(result.message).toContain('GOOGLE_VIDEOS_SHEET_ID');
  });

  it('classifies created, updated, and unchanged videos', async () => {
    mocked.fetchVideosFromSheetWithThumbnails.mockResolvedValue([
      { title: 'A', youtubeUrl: 'https://youtu.be/a', orderIndex: 0 },
      { title: 'B', youtubeUrl: 'https://youtu.be/b', orderIndex: 1 },
    ]);
    mocked.getVideoUrls.mockResolvedValue(new Set(['https://youtu.be/a', 'https://youtu.be/b']));
    mocked.upsertVideo
      .mockResolvedValueOnce({ action: 'created', video: {} as never })
      .mockResolvedValueOnce({ action: 'unchanged', video: {} as never });

    const result = await syncVideos();

    expect(result.details).toMatchObject({ created: 1, updated: 0, unchanged: 1 });
  });

  it('aborts the entire sync when an upsert fails partway through (unlike photo sync)', async () => {
    mocked.fetchVideosFromSheetWithThumbnails.mockResolvedValue([
      { title: 'First', youtubeUrl: 'https://youtu.be/first', orderIndex: 0 },
      { title: 'Second', youtubeUrl: 'https://youtu.be/second', orderIndex: 1 },
    ]);
    mocked.getVideoUrls.mockResolvedValue(new Set());
    mocked.upsertVideo.mockRejectedValueOnce(new Error('constraint violation'));

    const result = await syncVideos();

    expect(result.success).toBe(false);
    expect(result.message).toContain('constraint violation');
    expect(mocked.upsertVideo).toHaveBeenCalledTimes(1); // "Second" never attempted
  });

  it('deletes videos present in the DB but no longer in the sheet', async () => {
    mocked.fetchVideosFromSheetWithThumbnails.mockResolvedValue([]);
    mocked.getVideoUrls.mockResolvedValue(new Set(['https://youtu.be/gone']));

    const result = await syncVideos();

    expect(mocked.sql).toHaveBeenCalled();
    expect(result.details!.deleted).toBe(1);
  });
});
