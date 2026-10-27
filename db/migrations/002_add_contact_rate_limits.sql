-- Migration: Add contact_rate_limits table
-- Backs the per-IP fixed-window rate limit on POST /api/contact
-- (see incrementContactRateLimit in src/lib/db.ts). Safe to re-run.

CREATE TABLE IF NOT EXISTS contact_rate_limits (
  ip VARCHAR(64) PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 1
);
