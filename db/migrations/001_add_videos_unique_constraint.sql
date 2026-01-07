-- Migration: Add UNIQUE constraint to videos.youtube_url
-- This allows the upsertVideo function to use ON CONFLICT for proper upserting

-- First, remove any duplicate videos (keep the oldest one)
DELETE FROM videos
WHERE id NOT IN (
  SELECT MIN(id)
  FROM videos
  GROUP BY youtube_url
);

-- Add UNIQUE constraint to youtube_url
ALTER TABLE videos
ADD CONSTRAINT videos_youtube_url_unique UNIQUE (youtube_url);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_videos_youtube_url ON videos(youtube_url);
