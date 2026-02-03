/**
 * Sync throttling mechanism to prevent excessive database operations.
 * Tracks last sync times and enforces minimum intervals between syncs.
 */

const lastSyncTimes = new Map<string, number>();

/**
 * Check if a sync operation should proceed based on throttling rules.
 * @param syncType - Identifier for the sync operation (e.g., 'calendar', 'photos', 'videos')
 * @param minIntervalMs - Minimum milliseconds between syncs
 * @returns true if sync should proceed, false if throttled
 */
export function shouldSync(syncType: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const lastSync = lastSyncTimes.get(syncType) || 0;

  if (now - lastSync < minIntervalMs) {
    console.log(
      `Throttling ${syncType} sync - last sync ${Math.round((now - lastSync) / 1000)}s ago`
    );
    return false;
  }

  lastSyncTimes.set(syncType, now);
  return true;
}

/**
 * Record that a sync operation completed successfully.
 * @param syncType - Identifier for the sync operation
 */
export function recordSync(syncType: string): void {
  lastSyncTimes.set(syncType, Date.now());
}
