import { neon, neonConfig } from '@neondatabase/serverless';

// Test-only: redirect neon()'s HTTP driver at a local bridge in front of a
// real Postgres instance (see scripts/neon-http-bridge.js). Never set outside
// test/CI infra - neon() otherwise only ever talks to a real Neon endpoint.
// Restricted to loopback+http so an accidental/misconfigured value in a real
// environment can't redirect every query (including the full connection
// string, sent as a header on each request) to an arbitrary remote host.
function isLoopbackHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

if (process.env.NEON_HTTP_BRIDGE_URL) {
  if (isLoopbackHttpUrl(process.env.NEON_HTTP_BRIDGE_URL)) {
    neonConfig.fetchEndpoint = process.env.NEON_HTTP_BRIDGE_URL;
  } else {
    console.warn(
      `NEON_HTTP_BRIDGE_URL is set but is not a loopback http:// URL - ignoring it. Value: ${process.env.NEON_HTTP_BRIDGE_URL}`
    );
  }
}

// Allow build to succeed without DATABASE_URL (for static pages)
// At runtime, pages that need the database will fail if it's not set
const databaseUrl = process.env.DATABASE_URL || 'postgresql://placeholder@localhost/placeholder';

export const sql = neon(databaseUrl);

// Types matching our database schema
export interface DbEvent {
  id: number;
  google_event_id: string;
  title: string;
  date: string;
  time: string;
  venue: string | null;
  address: string | null;
  description: string | null;
  ticket_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbPhoto {
  id: number;
  google_drive_id: string;
  title: string;
  category: 'performance' | 'backstage' | 'press' | 'promo';
  alt_text: string | null;
  optimized_url: string;
  width: number | null;
  height: number | null;
  order_index: number;
  created_at: Date;
  updated_at: Date;
}

export interface DbVideo {
  id: number;
  title: string;
  youtube_url: string;
  thumbnail_url: string | null;
  description: string | null;
  category: 'live' | 'music-video' | 'interview' | null;
  order_index: number;
  created_at: Date;
  updated_at: Date;
}

export interface DbSyncLog {
  id: number;
  sync_type: 'calendar' | 'photos' | 'videos';
  status: 'success' | 'error';
  message: string | null;
  synced_at: Date;
}

// Helper functions for common queries

export async function getEvents() {
  const result = await sql`
    SELECT * FROM events 
    ORDER BY date ASC
  `;
  return result as DbEvent[];
}

export async function getUpcomingEvents() {
  const result = await sql`
    SELECT * FROM events 
    WHERE date >= CURRENT_DATE 
    ORDER BY date ASC
  `;
  return result as DbEvent[];
}

export async function getPastEvents(limit = 5) {
  const result = await sql`
    SELECT * FROM events 
    WHERE date < CURRENT_DATE 
    ORDER BY date DESC
    LIMIT ${limit}
  `;
  return result as DbEvent[];
}

export async function getPhotos(category?: DbPhoto['category']) {
  if (category) {
    const result = await sql`
      SELECT * FROM photos 
      WHERE category = ${category}
      ORDER BY order_index ASC, created_at DESC
    `;
    return result as DbPhoto[];
  }
  const result = await sql`
    SELECT * FROM photos 
    ORDER BY order_index ASC, created_at DESC
  `;
  return result as DbPhoto[];
}

export async function getVideos() {
  const result = await sql`
    SELECT * FROM videos
    ORDER BY order_index ASC, created_at DESC
  `;
  return result as DbVideo[];
}

/**
 * Get only event IDs for efficient sync operations.
 * Avoids fetching full event data when only IDs are needed.
 */
export async function getEventIds(): Promise<Set<string>> {
  const result = await sql`SELECT google_event_id FROM events`;
  return new Set(result.map((r) => r.google_event_id as string));
}

/**
 * Get only photo IDs for efficient sync operations.
 * Avoids fetching full photo data when only IDs are needed.
 */
export async function getPhotoIds(): Promise<Set<string>> {
  const result = await sql`SELECT google_drive_id FROM photos`;
  return new Set(result.map((r) => r.google_drive_id as string));
}

/**
 * Get only video URLs for efficient sync operations.
 * Avoids fetching full video data when only URLs are needed.
 */
export async function getVideoUrls(): Promise<Set<string>> {
  const result = await sql`SELECT youtube_url FROM videos`;
  return new Set(result.map((r) => r.youtube_url as string));
}

export async function upsertEvent(event: {
  google_event_id: string;
  title: string;
  date: string;
  time: string;
  venue?: string | null;
  address?: string | null;
  description?: string | null;
  ticket_url?: string | null;
}): Promise<{ action: 'created' | 'updated' | 'unchanged'; event: DbEvent }> {
  // Use ON CONFLICT with WHERE clause to skip update if data hasn't changed
  // This prevents unnecessary writes and updated_at changes
  const result = await sql`
    INSERT INTO events (
      google_event_id, title, date, time, venue, address, description, ticket_url, updated_at
    ) VALUES (
      ${event.google_event_id}, 
      ${event.title}, 
      ${event.date}, 
      ${event.time}, 
      ${event.venue ?? null}, 
      ${event.address ?? null}, 
      ${event.description ?? null}, 
      ${event.ticket_url ?? null},
      NOW()
    )
    ON CONFLICT (google_event_id) 
    DO UPDATE SET
      title = EXCLUDED.title,
      date = EXCLUDED.date,
      time = EXCLUDED.time,
      venue = EXCLUDED.venue,
      address = EXCLUDED.address,
      description = EXCLUDED.description,
      ticket_url = EXCLUDED.ticket_url,
      updated_at = NOW()
    WHERE 
      events.title IS DISTINCT FROM EXCLUDED.title OR
      events.date IS DISTINCT FROM EXCLUDED.date OR
      events.time IS DISTINCT FROM EXCLUDED.time OR
      events.venue IS DISTINCT FROM EXCLUDED.venue OR
      events.address IS DISTINCT FROM EXCLUDED.address OR
      events.description IS DISTINCT FROM EXCLUDED.description OR
      events.ticket_url IS DISTINCT FROM EXCLUDED.ticket_url
    RETURNING *, (xmax = 0) AS inserted
  `;

  if (result.length === 0) {
    // No row returned means WHERE clause prevented update (unchanged)
    const existing = await sql`SELECT *, true AS inserted FROM events WHERE google_event_id = ${event.google_event_id}`;
    return { action: 'unchanged', event: existing[0] as DbEvent };
  }

  const row = result[0] as DbEvent & { inserted: boolean };

  // inserted = true means it was an INSERT
  // inserted = false and row returned means it was an UPDATE
  return {
    action: row.inserted ? 'created' : 'updated',
    event: row,
  };
}

export async function deleteEvent(googleEventId: string) {
  return sql`
    DELETE FROM events 
    WHERE google_event_id = ${googleEventId}
  `;
}

export async function upsertPhoto(photo: {
  google_drive_id: string;
  title: string;
  category: DbPhoto['category'];
  alt_text?: string | null;
  optimized_url: string;
  width?: number | null;
  height?: number | null;
  order_index?: number;
}): Promise<{ action: 'created' | 'updated' | 'unchanged'; photo: DbPhoto }> {
  // Use ON CONFLICT with WHERE clause to skip update if data hasn't changed
  const result = await sql`
    INSERT INTO photos (
      google_drive_id, title, category, alt_text, optimized_url, width, height, order_index, updated_at
    ) VALUES (
      ${photo.google_drive_id}, 
      ${photo.title}, 
      ${photo.category}, 
      ${photo.alt_text ?? null}, 
      ${photo.optimized_url}, 
      ${photo.width ?? null}, 
      ${photo.height ?? null}, 
      ${photo.order_index ?? 0},
      NOW()
    )
    ON CONFLICT (google_drive_id) 
    DO UPDATE SET
      title = EXCLUDED.title,
      category = EXCLUDED.category,
      alt_text = EXCLUDED.alt_text,
      optimized_url = EXCLUDED.optimized_url,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      order_index = EXCLUDED.order_index,
      updated_at = NOW()
    WHERE 
      photos.title IS DISTINCT FROM EXCLUDED.title OR
      photos.category IS DISTINCT FROM EXCLUDED.category OR
      photos.alt_text IS DISTINCT FROM EXCLUDED.alt_text OR
      photos.optimized_url IS DISTINCT FROM EXCLUDED.optimized_url OR
      photos.width IS DISTINCT FROM EXCLUDED.width OR
      photos.height IS DISTINCT FROM EXCLUDED.height OR
      photos.order_index IS DISTINCT FROM EXCLUDED.order_index
    RETURNING *, (xmax = 0) AS inserted
  `;

  if (result.length === 0) {
    // No row returned means WHERE clause prevented update (unchanged)
    const existing = await sql`SELECT *, true AS inserted FROM photos WHERE google_drive_id = ${photo.google_drive_id}`;
    return { action: 'unchanged', photo: existing[0] as DbPhoto };
  }

  const row = result[0] as DbPhoto & { inserted: boolean };

  return {
    action: row.inserted ? 'created' : 'updated',
    photo: row,
  };
}

export async function deletePhoto(googleDriveId: string) {
  return sql`
    DELETE FROM photos 
    WHERE google_drive_id = ${googleDriveId}
  `;
}

export async function upsertVideo(video: {
  title: string;
  youtube_url: string;
  thumbnail_url?: string | null;
  description?: string | null;
  category?: DbVideo['category'];
  order_index?: number;
}): Promise<{ action: 'created' | 'updated' | 'unchanged'; video: DbVideo }> {
  const result = await sql`
    INSERT INTO videos (
      title, youtube_url, thumbnail_url, description, category, order_index, updated_at
    ) VALUES (
      ${video.title}, 
      ${video.youtube_url}, 
      ${video.thumbnail_url ?? null}, 
      ${video.description ?? null}, 
      ${video.category ?? null}, 
      ${video.order_index ?? 0},
      NOW()
    )
    ON CONFLICT (youtube_url)
    DO UPDATE SET
      title = EXCLUDED.title,
      thumbnail_url = EXCLUDED.thumbnail_url,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      order_index = EXCLUDED.order_index,
      updated_at = NOW()
    WHERE 
      videos.title IS DISTINCT FROM EXCLUDED.title OR
      videos.thumbnail_url IS DISTINCT FROM EXCLUDED.thumbnail_url OR
      videos.description IS DISTINCT FROM EXCLUDED.description OR
      videos.category IS DISTINCT FROM EXCLUDED.category OR
      videos.order_index IS DISTINCT FROM EXCLUDED.order_index
    RETURNING *, (xmax = 0) AS inserted
  `;

  if (result.length === 0) {
    // No row returned means WHERE clause prevented update (unchanged)
    const existing = await sql`SELECT *, false AS inserted FROM videos WHERE youtube_url = ${video.youtube_url}`;
    if (existing.length === 0) {
      throw new Error(`Video with youtube_url ${video.youtube_url} not found after upsert`);
    }
    return { action: 'unchanged', video: existing[0] as DbVideo };
  }

  const row = result[0] as DbVideo & { inserted: boolean };

  return {
    action: row.inserted ? 'created' : 'updated',
    video: row,
  };
}

export async function deleteVideo(id: number) {
  return sql`
    DELETE FROM videos 
    WHERE id = ${id}
  `;
}

export async function deleteAllVideos() {
  return sql`
    DELETE FROM videos
  `;
}

export async function logSync(log: {
  sync_type: DbSyncLog['sync_type'];
  status: DbSyncLog['status'];
  message?: string | null;
}) {
  return sql`
    INSERT INTO sync_log (sync_type, status, message)
    VALUES (${log.sync_type}, ${log.status}, ${log.message ?? null})
    RETURNING *
  `;
}

export async function getRecentSyncLogs(limit = 20) {
  const result = await sql`
    SELECT * FROM sync_log
    ORDER BY synced_at DESC
    LIMIT ${limit}
  `;
  return result as DbSyncLog[];
}

/**
 * Get the last successful sync time for a given sync type.
 * Used by throttling mechanism to persist state across serverless cold starts.
 * @param syncType - The type of sync operation
 * @returns Date of last successful sync, or null if never synced
 */
export async function getLastSuccessfulSync(syncType: DbSyncLog['sync_type']): Promise<Date | null> {
  const result = await sql`
    SELECT synced_at FROM sync_log
    WHERE sync_type = ${syncType} AND status = 'success'
    ORDER BY synced_at DESC
    LIMIT 1
  `;
  return result.length > 0 ? result[0].synced_at : null;
}

/**
 * Stored image data for a photo, preserved when sync only updates metadata.
 */
export type PhotoImageData = Pick<DbPhoto, 'optimized_url' | 'width' | 'height'>;

/**
 * Get the stored image data for every photo, keyed by Drive file ID.
 * Fetched in one query so photo sync doesn't issue a lookup per existing photo (N+1).
 */
export async function getPhotoImageDataByDriveId(): Promise<Map<string, PhotoImageData>> {
  const result = await sql`SELECT google_drive_id, optimized_url, width, height FROM photos`;
  return new Map(
    result.map((r) => [
      r.google_drive_id as string,
      {
        optimized_url: r.optimized_url as string,
        width: r.width as number | null,
        height: r.height as number | null,
      },
    ])
  );
}

/**
 * Update metadata (title, category, alt text, order) for existing photos in a
 * single query, so photo sync doesn't issue one upsert per photo (N+1).
 * Stored image data (optimized_url, width, height) is left untouched. Rows whose
 * metadata hasn't changed are skipped, so their updated_at isn't bumped.
 * @returns The Drive IDs of the photos that were actually updated
 */
export async function updatePhotosMetadata(
  photos: {
    google_drive_id: string;
    title: string;
    category: DbPhoto['category'];
    alt_text?: string | null;
    order_index: number;
  }[]
): Promise<Set<string>> {
  if (photos.length === 0) return new Set();

  const result = await sql`
    UPDATE photos SET
      title = data.title,
      category = data.category,
      alt_text = data.alt_text,
      order_index = data.order_index,
      updated_at = NOW()
    FROM UNNEST(
      ${photos.map((p) => p.google_drive_id)}::text[],
      ${photos.map((p) => p.title)}::text[],
      ${photos.map((p) => p.category)}::text[],
      ${photos.map((p) => p.alt_text ?? null)}::text[],
      ${photos.map((p) => p.order_index)}::int[]
    ) AS data(google_drive_id, title, category, alt_text, order_index)
    WHERE photos.google_drive_id = data.google_drive_id AND (
      photos.title IS DISTINCT FROM data.title OR
      photos.category IS DISTINCT FROM data.category OR
      photos.alt_text IS DISTINCT FROM data.alt_text OR
      photos.order_index IS DISTINCT FROM data.order_index
    )
    RETURNING photos.google_drive_id
  `;

  return new Set(result.map((r) => r.google_drive_id as string));
}

/**
 * Clean up old sync logs to prevent unbounded table growth.
 * @param daysToKeep - Number of days of logs to retain (default: 30)
 * @returns Number of deleted log entries
 */
export async function cleanupOldSyncLogs(daysToKeep = 30): Promise<number> {
  const result = await sql`
    DELETE FROM sync_log
    WHERE synced_at < NOW() - INTERVAL '1 day' * ${daysToKeep}
    RETURNING id
  `;
  return result.length;
}

export interface DbWebhookChannel {
  id: number;
  channel_id: string;
  resource_type: 'calendar' | 'drive';
  resource_id: string;
  expiration: number;
  webhook_url: string | null;
  folder_id: string | null;
  last_renewed_at: Date | null;
  renewal_failures: number;
  created_at: Date;
}

export async function upsertWebhookChannel(channel: {
  channel_id: string;
  resource_type: 'calendar' | 'drive';
  resource_id: string;
  expiration: number;
  webhook_url?: string;
  folder_id?: string;
}) {
  const webhookUrl =
    channel.webhook_url ||
    (channel.resource_type === 'calendar'
      ? 'https://kelso-kelly-site.vercel.app/api/webhook-calendar'
      : 'https://kelso-kelly-site.vercel.app/api/webhook-drive');

  return sql`
    INSERT INTO webhook_channels (channel_id, resource_type, resource_id, expiration, webhook_url, folder_id, last_renewed_at, renewal_failures)
    VALUES (${channel.channel_id}, ${channel.resource_type}, ${channel.resource_id}, ${channel.expiration}, ${webhookUrl}, ${channel.folder_id || null}, NOW(), 0)
    ON CONFLICT (channel_id)
    DO UPDATE SET
      resource_type = EXCLUDED.resource_type,
      resource_id = EXCLUDED.resource_id,
      expiration = EXCLUDED.expiration,
      webhook_url = EXCLUDED.webhook_url,
      folder_id = EXCLUDED.folder_id,
      last_renewed_at = NOW(),
      renewal_failures = 0
    RETURNING *
  `;
}

export async function getWebhookChannels(): Promise<DbWebhookChannel[]> {
  const result = await sql`
    SELECT * FROM webhook_channels
    ORDER BY expiration ASC
  `;
  // expiration is BIGINT - some drivers return that as a string, so
  // normalize it to a number here rather than making every caller guard.
  return (result as DbWebhookChannel[]).map((row) => ({
    ...row,
    expiration: Number(row.expiration),
  }));
}

/**
 * Whether a push notification's channel/resource IDs match a channel we created.
 * Webhook URLs are public, so this is what stops a forged notification from
 * triggering a sync: only Google (and our DB) know a live channel's resource ID.
 */
export async function isKnownWebhookChannel(
  channelId: string,
  resourceId: string,
  resourceType: DbWebhookChannel['resource_type']
): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM webhook_channels
    WHERE channel_id = ${channelId}
      AND resource_id = ${resourceId}
      AND resource_type = ${resourceType}
    LIMIT 1
  `;
  return result.length > 0;
}

export async function deleteWebhookChannel(channelId: string) {
  return sql`
    DELETE FROM webhook_channels 
    WHERE channel_id = ${channelId}
  `;
}
