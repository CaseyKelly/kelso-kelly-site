import '@testing-library/jest-dom/vitest';

// A handful of modules validate required env vars at import time (e.g.
// src/app/api/contact/route.ts) or throw as soon as a Google API client is
// requested (src/lib/google-*.ts). Provide harmless defaults so importing
// those modules in a test file doesn't blow up before the test even mocks
// the pieces it cares about. Individual tests can override any of these
// with vi.stubEnv()/process.env assignments for env-specific behavior.
process.env.RESEND_API_KEY ??= 'test-resend-api-key';
process.env.RESEND_FROM_EMAIL ??= 'test@example.com';
process.env.CONTACT_EMAIL ??= 'contact@example.com';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ??= 'test-service-account@example.com';
process.env.GOOGLE_PRIVATE_KEY ??= '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n';
process.env.GOOGLE_CALENDAR_ID ??= 'test-calendar-id';
process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID ??= 'test-photos-folder-id';
process.env.GOOGLE_DRIVE_VIDEOS_FOLDER_ID ??= 'test-videos-folder-id';
process.env.GOOGLE_VIDEOS_SHEET_ID ??= 'test-videos-sheet-id';
