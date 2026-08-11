import { describe, it, expect } from 'vitest';
import { getYouTubeThumbnail, parseCategory } from './google-sheets';

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
