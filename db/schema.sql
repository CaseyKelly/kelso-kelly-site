-- Kelso Kelly Music Database Schema
-- For use with Neon Postgres

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  google_event_id VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  time VARCHAR(50) NOT NULL,
  venue VARCHAR(255),
  address TEXT,
  description TEXT,
  ticket_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_date ON events(date DESC);
CREATE INDEX IF NOT EXISTS idx_events_google_id ON events(google_event_id);

-- Photos table
CREATE TABLE IF NOT EXISTS photos (
  id SERIAL PRIMARY KEY,
  google_drive_id VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL, -- performance, backstage, press, promo
  alt_text TEXT,
  optimized_url TEXT NOT NULL, -- URL to Vercel Blob storage
  width INTEGER,
  height INTEGER,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photos_category ON photos(category);
CREATE INDEX IF NOT EXISTS idx_photos_order ON photos(order_index);

-- Videos table
CREATE TABLE IF NOT EXISTS videos (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  youtube_url TEXT UNIQUE NOT NULL,
  thumbnail_url TEXT,
  description TEXT,
  category VARCHAR(50), -- live, music-video, interview
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_order ON videos(order_index);
CREATE INDEX IF NOT EXISTS idx_videos_youtube_url ON videos(youtube_url);

-- Sync log table (for debugging/monitoring)
CREATE TABLE IF NOT EXISTS sync_log (
  id SERIAL PRIMARY KEY,
  sync_type VARCHAR(50) NOT NULL, -- 'calendar', 'photos', 'videos'
  status VARCHAR(50) NOT NULL, -- 'success', 'error'
  message TEXT,
  synced_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_type ON sync_log(sync_type, synced_at DESC);

-- Webhook channels table (to track active webhooks)
CREATE TABLE IF NOT EXISTS webhook_channels (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR(255) UNIQUE NOT NULL,
  resource_type VARCHAR(50) NOT NULL, -- 'calendar', 'drive'
  resource_id VARCHAR(255) NOT NULL,
  expiration BIGINT NOT NULL, -- Unix timestamp in milliseconds
  webhook_url TEXT, -- URL where webhook notifications are sent
  last_renewed_at TIMESTAMP, -- When webhook was last successfully renewed
  renewal_failures INTEGER DEFAULT 0, -- Count of consecutive renewal failures
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_channels_expiration ON webhook_channels(expiration);
