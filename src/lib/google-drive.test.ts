import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';
import {
  getCategoryFromFolderName,
  cleanFilenameForTitle,
  downloadFile,
  listImageFilesInFolder,
  getFolderMetadata,
  findFolderByName,
  watchFolder,
  stopWatchingFolder,
} from './google-drive';

// Mocks the googleapis SDK itself (not just this module's wrapper functions)
// so a googleapis version bump that changes response shapes or error formats
// would actually be caught here.
const { mockFilesList, mockFilesGet, mockFilesWatch, mockChannelsStop } = vi.hoisted(() => ({
  mockFilesList: vi.fn(),
  mockFilesGet: vi.fn(),
  mockFilesWatch: vi.fn(),
  mockChannelsStop: vi.fn(),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(function GoogleAuth() {
        return {};
      }),
    },
    drive: vi.fn(() => ({
      files: { list: mockFilesList, get: mockFilesGet, watch: mockFilesWatch },
      channels: { stop: mockChannelsStop },
    })),
  },
}));

describe('getCategoryFromFolderName', () => {
  it('matches known category keywords case-insensitively', () => {
    expect(getCategoryFromFolderName('Performance Photos')).toBe('performance');
    expect(getCategoryFromFolderName('BACKSTAGE')).toBe('backstage');
    expect(getCategoryFromFolderName('press kit')).toBe('press');
    expect(getCategoryFromFolderName('Promo Shots')).toBe('promo');
  });

  it('trims whitespace before matching', () => {
    expect(getCategoryFromFolderName('  performance  ')).toBe('performance');
  });

  it('returns null when no keyword matches', () => {
    expect(getCategoryFromFolderName('Miscellaneous')).toBeNull();
    expect(getCategoryFromFolderName('')).toBeNull();
  });
});

describe('cleanFilenameForTitle', () => {
  it('strips the file extension', () => {
    expect(cleanFilenameForTitle('sunset-show.jpg')).toBe('Sunset Show');
  });

  it('replaces hyphens and underscores with spaces', () => {
    expect(cleanFilenameForTitle('kelso_playing-guitar.png')).toBe('Kelso Playing Guitar');
  });

  it('capitalizes the first letter of each word', () => {
    expect(cleanFilenameForTitle('live at the aggie.webp')).toBe('Live At The Aggie');
  });

  it('handles filenames with multiple dots by only stripping the last extension', () => {
    expect(cleanFilenameForTitle('IMG.2026.08.15.jpeg')).toBe('IMG.2026.08.15');
  });

  it('handles filenames with no extension', () => {
    expect(cleanFilenameForTitle('no-extension-here')).toBe('No Extension Here');
  });

  it('leaves already-uppercase words as-is beyond the first letter', () => {
    expect(cleanFilenameForTitle('IMG_1234.jpg')).toBe('IMG 1234');
  });
});

describe('listImageFilesInFolder (against a mocked googleapis client)', () => {
  beforeEach(() => {
    mockFilesList.mockReset();
  });

  it('maps a realistic Drive files.list response into DriveFile shape', async () => {
    mockFilesList.mockResolvedValue({
      data: {
        files: [
          {
            id: 'file-1',
            name: 'sunset.jpg',
            mimeType: 'image/jpeg',
            createdTime: '2026-01-01T00:00:00Z',
            modifiedTime: '2026-01-02T00:00:00Z',
            size: '1024',
          },
        ],
      },
    });

    const files = await listImageFilesInFolder('folder-1');

    expect(files).toEqual([
      {
        id: 'file-1',
        name: 'sunset.jpg',
        mimeType: 'image/jpeg',
        createdTime: '2026-01-01T00:00:00Z',
        modifiedTime: '2026-01-02T00:00:00Z',
        size: '1024',
      },
    ]);
    expect(mockFilesList.mock.calls[0][0]).toMatchObject({
      q: expect.stringContaining("mimeType contains 'image/'"),
    });
  });

  it('returns an empty array when the response has no files', async () => {
    mockFilesList.mockResolvedValue({ data: {} });
    expect(await listImageFilesInFolder('folder-1')).toEqual([]);
  });

  it('wraps and rethrows when the API call fails', async () => {
    mockFilesList.mockRejectedValue(new Error('rate limited'));
    await expect(listImageFilesInFolder('folder-1')).rejects.toThrow('rate limited');
  });
});

describe('downloadFile (against a mocked googleapis client)', () => {
  beforeEach(() => {
    mockFilesGet.mockReset();
  });

  it('collects a real Node stream into a Buffer', async () => {
    const stream = Readable.from([Buffer.from('hello '), Buffer.from('world')]);
    mockFilesGet.mockResolvedValue({ data: stream });

    const buffer = await downloadFile('file-1');

    expect(buffer.toString()).toBe('hello world');
    expect(mockFilesGet).toHaveBeenCalledWith({ fileId: 'file-1', alt: 'media' }, { responseType: 'stream' });
  });

  it('rejects when the underlying stream emits an error', async () => {
    const stream = new Readable({ read() {} });
    mockFilesGet.mockResolvedValue({ data: stream });

    const promise = downloadFile('file-1');
    // Let downloadFile's `await drive.files.get(...)` resolve and attach its
    // stream listeners before we emit, or the event fires with no listener.
    await new Promise((resolve) => setImmediate(resolve));
    stream.emit('error', new Error('network interrupted'));

    await expect(promise).rejects.toThrow('network interrupted');
  });
});

describe('getFolderMetadata (against a mocked googleapis client)', () => {
  beforeEach(() => {
    mockFilesGet.mockReset();
  });

  it('returns metadata for an actual folder', async () => {
    mockFilesGet.mockResolvedValue({
      data: { id: 'folder-1', name: 'Photos', mimeType: 'application/vnd.google-apps.folder' },
    });
    const result = await getFolderMetadata('folder-1');
    expect(result).toMatchObject({ id: 'folder-1', name: 'Photos' });
  });

  it('rejects when the ID does not point to a folder', async () => {
    mockFilesGet.mockResolvedValue({ data: { id: 'file-1', name: 'photo.jpg', mimeType: 'image/jpeg' } });
    await expect(getFolderMetadata('file-1')).rejects.toThrow('not a folder');
  });
});

describe('findFolderByName (against a mocked googleapis client)', () => {
  beforeEach(() => {
    mockFilesList.mockReset();
  });

  it('returns the folder ID when found', async () => {
    mockFilesList.mockResolvedValue({ data: { files: [{ id: 'folder-42', name: 'Performance' }] } });
    expect(await findFolderByName('parent-1', 'Performance')).toBe('folder-42');
  });

  it('returns null when no matching folder exists', async () => {
    mockFilesList.mockResolvedValue({ data: { files: [] } });
    expect(await findFolderByName('parent-1', 'Nonexistent')).toBeNull();
  });

  it('returns null (rather than throwing) when the API call fails', async () => {
    mockFilesList.mockRejectedValue(new Error('boom'));
    expect(await findFolderByName('parent-1', 'Performance')).toBeNull();
  });
});

describe('watchFolder (against a mocked googleapis client)', () => {
  it('returns the channel info from a realistic watch response', async () => {
    mockFilesWatch.mockResolvedValue({
      data: { id: 'channel-1', resourceId: 'resource-1', expiration: '1786400000000' },
    });
    const result = await watchFolder('https://example.com/webhook', 'channel-1', 'folder-1');
    expect(result).toEqual({ channelId: 'channel-1', resourceId: 'resource-1', expiration: 1786400000000 });
  });
});

describe('stopWatchingFolder (against a mocked googleapis client)', () => {
  beforeEach(() => {
    mockChannelsStop.mockReset();
  });

  it('swallows a 404 (channel already expired/deleted)', async () => {
    mockChannelsStop.mockRejectedValue({ code: 404 });
    await expect(stopWatchingFolder('channel-1', 'resource-1')).resolves.toBeUndefined();
  });

  it('rethrows a non-404 error', async () => {
    mockChannelsStop.mockRejectedValue({ code: 500 });
    await expect(stopWatchingFolder('channel-1', 'resource-1')).rejects.toThrow();
  });
});
