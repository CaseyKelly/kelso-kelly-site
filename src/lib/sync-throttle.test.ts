import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldSync } from './sync-throttle';
import { getLastSuccessfulSync } from './db';

vi.mock('./db', () => ({
  getLastSuccessfulSync: vi.fn(),
}));

const mockedGetLastSuccessfulSync = vi.mocked(getLastSuccessfulSync);

describe('shouldSync', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockedGetLastSuccessfulSync.mockReset();
  });

  it('allows the sync when there is no prior successful sync', async () => {
    mockedGetLastSuccessfulSync.mockResolvedValue(null);
    await expect(shouldSync('calendar', 60_000)).resolves.toBe(true);
  });

  it('throttles when the last sync was well within the interval', async () => {
    mockedGetLastSuccessfulSync.mockResolvedValue(new Date(Date.now() - 1_000));
    await expect(shouldSync('calendar', 60_000)).resolves.toBe(false);
  });

  it('allows the sync once the interval has fully elapsed', async () => {
    mockedGetLastSuccessfulSync.mockResolvedValue(new Date(Date.now() - 61_000));
    await expect(shouldSync('calendar', 60_000)).resolves.toBe(true);
  });

  it('does not throttle at exactly the boundary (time since sync === interval)', async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mockedGetLastSuccessfulSync.mockResolvedValue(new Date(now - 60_000));
    // timeSinceLastSync (60_000) < minIntervalMs (60_000) is false, so this
    // should NOT be throttled - documents the exact boundary behavior.
    await expect(shouldSync('calendar', 60_000)).resolves.toBe(true);
    vi.useRealTimers();
  });
});
