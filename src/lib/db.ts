import { neon } from '@neondatabase/serverless';

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
  // First check if event exists and if data is different
  const existing = await sql`
    SELECT * FROM events WHERE google_event_id = ${event.google_event_id}
  `;
  
  const existingEvent = existing[0] as DbEvent | undefined;
  
  // If exists, check if any fields changed
  if (existingEvent) {
    const hasChanges = 
      existingEvent.title !== event.title ||
      existingEvent.date !== event.date ||
      existingEvent.time !== event.time ||
      existingEvent.venue !== (event.venue ?? null) ||
      existingEvent.address !== (event.address ?? null) ||
      existingEvent.description !== (event.description ?? null) ||
      existingEvent.ticket_url !== (event.ticket_url ?? null);
    
    if (!hasChanges) {
      return { action: 'unchanged', event: existingEvent };
    }
  }
  
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
    RETURNING *
  `;
  
  return { 
    action: existingEvent ? 'updated' : 'created',
    event: result[0] as DbEvent
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
  // First check if photo exists and if data is different
  const existing = await sql`
    SELECT * FROM photos WHERE google_drive_id = ${photo.google_drive_id}
  `;
  
  const existingPhoto = existing[0] as DbPhoto | undefined;
  
  // If exists, check if any fields changed
  if (existingPhoto) {
    const hasChanges = 
      existingPhoto.title !== photo.title ||
      existingPhoto.category !== photo.category ||
      existingPhoto.alt_text !== (photo.alt_text ?? null) ||
      existingPhoto.optimized_url !== photo.optimized_url ||
      existingPhoto.width !== (photo.width ?? null) ||
      existingPhoto.height !== (photo.height ?? null) ||
      existingPhoto.order_index !== (photo.order_index ?? 0);
    
    if (!hasChanges) {
      return { action: 'unchanged', photo: existingPhoto };
    }
  }
  
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
    RETURNING *
  `;
  
  return { 
    action: existingPhoto ? 'updated' : 'created',
    photo: result[0] as DbPhoto
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
}) {
  return sql`
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
    RETURNING *
  `;
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

export async function upsertWebhookChannel(channel: {
  channel_id: string;
  resource_type: 'calendar' | 'drive';
  resource_id: string;
  expiration: number;
}) {
  return sql`
    INSERT INTO webhook_channels (channel_id, resource_type, resource_id, expiration)
    VALUES (${channel.channel_id}, ${channel.resource_type}, ${channel.resource_id}, ${channel.expiration})
    ON CONFLICT (channel_id)
    DO UPDATE SET
      resource_type = EXCLUDED.resource_type,
      resource_id = EXCLUDED.resource_id,
      expiration = EXCLUDED.expiration
    RETURNING *
  `;
}

export async function getWebhookChannels() {
  return sql`
    SELECT * FROM webhook_channels 
    ORDER BY expiration ASC
  `;
}

export async function deleteWebhookChannel(channelId: string) {
  return sql`
    DELETE FROM webhook_channels 
    WHERE channel_id = ${channelId}
  `;
}
