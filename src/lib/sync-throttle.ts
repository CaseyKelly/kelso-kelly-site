/**
 * Sync throttling mechanism to prevent excessive database operations.
 * Uses the sync_log table to persist state across serverless cold starts.
 */

import { getLastSuccessfulSync } from './db';
import type { DbSyncLog } from './db';

/**
 * Check if a sync operation should proceed based on throttling rules.
 * Uses database-backed state that persists across serverless cold starts.
 * @param syncType - The type of sync operation (e.g., 'calendar', 'photos', 'videos')
 * @param minIntervalMs - Minimum milliseconds between syncs
 * @returns true if sync should proceed, false if throttled
 */
export async function shouldSync(
  syncType: DbSyncLog['sync_type'],
  minIntervalMs: number
): Promise<boolean> {
  const lastSync = await getLastSuccessfulSync(syncType);

  if (!lastSync) {
    // Never synced before, allow it
    return true;
  }

  const now = Date.now();
  const lastSyncTime = new Date(lastSync).getTime();
  const timeSinceLastSync = now - lastSyncTime;

  if (timeSinceLastSync < minIntervalMs) {
    console.log(
      `Throttling ${syncType} sync - last sync ${Math.round(timeSinceLastSync / 1000)}s ago`
    );
    return false;
  }

  return true;
}
