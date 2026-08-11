-- Fixture data for Playwright E2E tests. Applied to a disposable test
-- Postgres (see scripts/e2e-server.js) after db/schema.sql. Dates are
-- relative to CURRENT_DATE so events stay upcoming/past regardless of when
-- the suite runs.

INSERT INTO events (google_event_id, title, date, time, venue, address, description, ticket_url) VALUES
  ('e2e-event-upcoming-1', 'Live at The Whiskey Barrel', CURRENT_DATE + INTERVAL '7 days', '7:00 PM', 'The Whiskey Barrel', '123 Main St, Fort Collins, CO', 'An intimate acoustic set.', 'https://example.com/tickets/1'),
  ('e2e-event-upcoming-2', 'Summer Concert Series', CURRENT_DATE + INTERVAL '21 days', '6:30 PM', 'Old Town Square', 'Old Town Square, Fort Collins, CO', NULL, NULL),
  ('e2e-event-past-1', 'New Year Show', CURRENT_DATE - INTERVAL '14 days', '9:00 PM', 'The Aggie Theatre', '204 S College Ave, Fort Collins, CO', NULL, NULL)
ON CONFLICT (google_event_id) DO NOTHING;

INSERT INTO photos (google_drive_id, title, category, alt_text, optimized_url, width, height, order_index) VALUES
  ('e2e-photo-1', 'Live Performance', 'performance', 'Kelso performing live on stage', 'https://placehold.co/800x600/png', 800, 600, 0),
  ('e2e-photo-2', 'Backstage', 'backstage', 'Backstage before a show', 'https://placehold.co/800x600/png', 800, 600, 1)
ON CONFLICT (google_drive_id) DO NOTHING;

INSERT INTO videos (title, youtube_url, thumbnail_url, description, category, order_index) VALUES
  ('Live at The Aggie', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', 'A full live set.', 'live', 0),
  ('Unlisted Song Cover', 'https://youtu.be/dQw4w9WgXcQ', NULL, NULL, 'music-video', 1)
ON CONFLICT (youtube_url) DO NOTHING;
