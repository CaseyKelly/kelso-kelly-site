import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getYouTubeThumbnail,
  parseCategory,
  fetchVideosFromSheet,
  getSpreadsheetLastModified,
} from './google-sheets';

// Mocks the googleapis SDK itself (not just this module's wrapper functions)
// so a googleapis version bump that changes response shapes or error formats
// would actually be caught here.
const { mockValuesGet, mockDriveFilesGet } = vi.hoisted(() => ({
  mockValuesGet: vi.fn(),
  mockDriveFilesGet: vi.fn(),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: { GoogleAuth: vi.fn().mockImplementation(function GoogleAuth() { return {}; }) },
    sheets: vi.fn(() => ({ spreadsheets: { values: { get: mockValuesGet } } })),
    drive: vi.fn(() => ({ files: { get: mockDriveFilesGet } })),
  },
}));

describe('getYouTubeThumbnail', () => {
  it('extracts the video ID from a standard watch URL', () => {
    expect(getYouTubeThumbnail('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    );
  });

  it('extracts the video ID from a youtu.be short URL', () => {
    expect(getYouTubeThumbnail('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    );
  });

  // Documents a known gap: the extraction regex only stops at `&` or
  // whitespace, so a `?t=30`-style query param on a youtu.be URL ends up
  // baked into the "video ID" instead of being stripped.
  it('does not strip a trailing query param after the youtu.be ID', () => {
    expect(getYouTubeThumbnail('https://youtu.be/dQw4w9WgXcQ?t=30')).toBe(
      'https://img.youtube.com/vi/dQw4w9WgXcQ?t=30/maxresdefault.jpg'
    );
  });

  // Documents a known gap: unlike the getYouTubeId() helpers duplicated in
  // page.tsx/MediaClient.tsx, this function's regex only recognizes
  // watch?v= and youtu.be/ URLs - /embed/ and /shorts/ links silently fall
  // through to null instead of producing a thumbnail.
  it('returns null for embed and shorts URLs (not currently supported)', () => {
    expect(getYouTubeThumbnail('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBeNull();
    expect(getYouTubeThumbnail('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBeNull();
  });

  it('returns null for a non-YouTube URL', () => {
    expect(getYouTubeThumbnail('https://example.com/video')).toBeNull();
  });
});

describe('parseCategory', () => {
  it('returns undefined for a missing category', () => {
    expect(parseCategory(undefined)).toBeUndefined();
    expect(parseCategory('')).toBeUndefined();
  });

  it('recognizes exact and substring matches for "live"', () => {
    expect(parseCategory('live')).toBe('live');
    expect(parseCategory('Live Performance')).toBe('live');
  });

  it('recognizes exact and substring matches for "music-video"', () => {
    expect(parseCategory('music-video')).toBe('music-video');
    expect(parseCategory('Music Video')).toBe('music-video');
  });

  it('recognizes only an exact match for "interview"', () => {
    expect(parseCategory('interview')).toBe('interview');
    expect(parseCategory('Interview')).toBe('interview');
  });

  it('returns undefined for an unrecognized category', () => {
    expect(parseCategory('behind the scenes')).toBeUndefined();
  });
});

describe('fetchVideosFromSheet (against a mocked googleapis client)', () => {
  beforeEach(() => {
    mockValuesGet.mockReset();
  });

  it('parses a realistic sheet response, skipping the header row', async () => {
    mockValuesGet.mockResolvedValue({
      data: {
        values: [
          ['Title', 'YouTube URL', 'Category', 'Description', 'Order'],
          ['Live at The Aggie', 'https://youtu.be/dQw4w9WgXcQ', 'live', 'Full set', '3'],
        ],
      },
    });

    const videos = await fetchVideosFromSheet('sheet-1');

    expect(videos).toEqual([
      { title: 'Live at The Aggie', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', category: 'live', description: 'Full set', orderIndex: 3 },
    ]);
    expect(mockValuesGet.mock.calls[0][0]).toMatchObject({ spreadsheetId: 'sheet-1', range: 'Videos!A:E' });
  });

  it('returns an empty array when the sheet has no rows', async () => {
    mockValuesGet.mockResolvedValue({ data: {} });
    expect(await fetchVideosFromSheet('sheet-1')).toEqual([]);
  });

  it('skips rows missing a title or YouTube URL', async () => {
    mockValuesGet.mockResolvedValue({
      data: { values: [['Title', 'URL'], ['', 'https://youtu.be/a'], ['No URL Song', '']] },
    });
    expect(await fetchVideosFromSheet('sheet-1')).toEqual([]);
  });

  it('skips rows with a non-YouTube URL', async () => {
    mockValuesGet.mockResolvedValue({
      data: { values: [['Title', 'URL'], ['Some Song', 'https://vimeo.com/123']] },
    });
    expect(await fetchVideosFromSheet('sheet-1')).toEqual([]);
  });

  it('defaults orderIndex to the row index when the Order column is blank', async () => {
    mockValuesGet.mockResolvedValue({
      data: {
        values: [
          ['Title', 'URL'],
          ['First', 'https://youtu.be/a'],
          ['Second', 'https://youtu.be/b'],
        ],
      },
    });
    const videos = await fetchVideosFromSheet('sheet-1');
    expect(videos.map((v) => v.orderIndex)).toEqual([0, 1]);
  });

  it('wraps and rethrows when the API call fails', async () => {
    mockValuesGet.mockRejectedValue(new Error('permission denied'));
    await expect(fetchVideosFromSheet('sheet-1')).rejects.toThrow('permission denied');
  });
});

describe('getSpreadsheetLastModified (against a mocked googleapis client)', () => {
  beforeEach(() => {
    mockDriveFilesGet.mockReset();
  });

  it('returns the modifiedTime from a realistic Drive response', async () => {
    mockDriveFilesGet.mockResolvedValue({ data: { modifiedTime: '2026-08-11T12:00:00Z' } });
    expect(await getSpreadsheetLastModified('sheet-1')).toBe('2026-08-11T12:00:00Z');
  });

  it('returns null (rather than throwing) when the API call fails', async () => {
    mockDriveFilesGet.mockRejectedValue(new Error('boom'));
    expect(await getSpreadsheetLastModified('sheet-1')).toBeNull();
  });
});
