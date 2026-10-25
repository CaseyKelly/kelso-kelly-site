# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Next.js 16 website for musician Kelso Kelly featuring:
- Event calendar synced from Google Calendar
- Photo gallery synced from Google Drive
- Video gallery synced from Google Sheets
- Automated webhooks for real-time content updates
- PostgreSQL database (Neon) for data storage
- Vercel Blob Storage for optimized images
- Contact form with email functionality (Resend)

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Neon PostgreSQL, Google APIs, Resend

## Commands

### Development
```bash
npm run dev          # Start dev server on http://localhost:3000
npm run build        # Production build
npm start            # Start production server
npm run lint         # Run ESLint
npx tsc --noEmit     # Type check without emitting files
```

### Testing
This project currently has no test suite. If adding tests, place them adjacent to source files using `ComponentName.test.tsx`.

## Architecture Overview

### Data Flow Architecture

The site uses a **webhook-based sync architecture** where Google services are the source of truth:

1. **Google Services → Database**: Content is synced from Google Calendar, Drive, and Sheets to PostgreSQL
2. **Database → Pages**: Next.js pages read from the database (server-side)
3. **Webhooks + Cron**: Real-time updates via webhooks + fallback cron jobs

**Key principle**: Database is the source of truth for the website. Google services sync TO the database, pages read FROM the database.

### Sync System

Three parallel sync pipelines in `src/lib/sync.ts`:

- **Calendar Events** (`syncCalendarEvents`): Fetches from Google Calendar API → upserts to `events` table
- **Photos** (`syncPhotos`): Downloads from Google Drive → optimizes images → uploads to Vercel Blob → upserts to `photos` table
- **Videos** (`syncVideos`): Fetches from Google Sheets → upserts to `videos` table

Each sync function returns a `SyncResult` with success status, message, and details.

### Database Patterns

All database operations use the Neon serverless driver with SQL template tags. Key patterns:

**Upsert with change detection**: The `upsert*` functions (e.g., `upsertEvent`, `upsertPhoto`) use `ON CONFLICT ... DO UPDATE` with a `WHERE` clause that only updates if data has changed:
```sql
ON CONFLICT (google_event_id)
DO UPDATE SET ...
WHERE events.title IS DISTINCT FROM EXCLUDED.title OR ...
RETURNING *, (xmax = 0) AS inserted
```

This pattern:
- Returns `'created'` if row was inserted
- Returns `'updated'` if row was modified
- Returns `'unchanged'` if data hasn't changed (skips the UPDATE, preventing unnecessary `updated_at` changes)

**Type safety**: Database results are typed using interfaces like `DbEvent`, `DbPhoto`, `DbVideo` defined in `src/lib/db.ts`.

### API Routes Structure

```
src/app/api/
  sync-calendar/route.ts    # Manual calendar sync trigger
  sync-photos/route.ts       # Manual photo sync trigger
  sync-videos/route.ts       # Manual video sync trigger
  webhook-calendar/route.ts  # Google Calendar webhook receiver
  webhook-drive/route.ts     # Google Drive webhook receiver (photos folder)
  webhook-drive-videos/route.ts # Google Drive webhook receiver (videos folder) - triggers GitHub Actions, doesn't sync in-request
  contact/route.ts           # Contact form submission handler
  cron/renew-webhooks/       # Daily webhook renewal (Vercel cron)
  webhooks/setup/            # Initial webhook setup endpoint
  revalidate/                # Manual ISR revalidation trigger
```

All sync routes accept `CRON_SECRET` for authentication via Bearer token.

The Google webhook receivers (`webhook-calendar`, `webhook-drive`, `webhook-drive-videos`) verify every non-`sync` notification with `isKnownWebhookChannel()` (the `X-Goog-Channel-ID` + `X-Goog-Resource-ID` pair must match a `webhook_channels` row) and return 403 otherwise, so a forged POST can't force a sync or dispatch the YouTube workflow. `/api/revalidate` and `/api/webhooks/setup` fail closed: they reject every request when their secret env var is unset.

`/api/contact` drops bot submissions with a fake 200 (honeypot field `website` filled in, or `formElapsedMs` missing or under 3s; see `src/lib/contact-spam.ts`) and rate limits real ones to 5 per IP per hour via the `contact_rate_limits` table (one atomic upsert, fails open on DB errors).

Every cron in `vercel.json` has a Sentry cron monitor in `src/lib/cron-monitor.ts` (`CRON_MONITORS`, whose schedules a test keeps in sync with `vercel.json`). Route `GET` handlers check auth first, then run the job through `withCronMonitor()`, which only checks in for `user-agent: vercel-cron` requests and marks the check-in failed on a non-2xx response or a `success: false` body.

### Route Groups

The `(site)` route group in `src/app/(site)/` contains public pages and shares a common layout (`layout.tsx`). This allows for a consistent header/footer without affecting API routes.

### Image Optimization Flow

Photos from Google Drive go through a multi-step process:
1. Download via `downloadFile()` from `src/lib/google-drive.ts`
2. Optimize using Sharp in `src/lib/image-optimizer.ts` (resize to max 1920px, convert to WebP, 85% quality)
3. Upload to Vercel Blob Storage with public access
4. Store the blob URL in the database

Existing photos skip steps 1-3 during sync to avoid expensive re-processing.

### Environment Variables

Required for local development (`.env.local`):
```
DATABASE_URL                      # Neon PostgreSQL connection string
GOOGLE_SERVICE_ACCOUNT_EMAIL      # Service account email
GOOGLE_PRIVATE_KEY                # Service account private key
GOOGLE_CALENDAR_ID                # Calendar to sync from
GOOGLE_DRIVE_PHOTOS_FOLDER_ID     # Photos folder ID
GOOGLE_DRIVE_VIDEOS_FOLDER_ID     # Videos folder ID — also used by the Next.js app to set up the videos Drive webhook (see below)
GOOGLE_VIDEOS_SHEET_ID            # Videos spreadsheet ID
CRON_SECRET                       # Auth token for cron/sync endpoints
RESEND_API_KEY                    # Resend API key for emails
RESEND_FROM_EMAIL                 # Sender email address
CONTACT_EMAIL                     # Recipient for contact form
SENTRY_DSN                        # Sentry DSN, server/edge runtimes (org: caseykelly, project: sentry-casey-kelly)
NEXT_PUBLIC_SENTRY_DSN            # Same Sentry DSN, exposed to the browser bundle
```

Required as a Vercel env var only (build-time, not needed for `npm run dev`):
```
SENTRY_AUTH_TOKEN                 # Sentry auth token for uploading source maps during build — create at sentry.io/settings/account/api/auth-tokens/
```

Required as a GitHub Actions secret too (in addition to the Vercel env var above) for the Drive → YouTube upload pipeline — see `scripts/sync-drive-videos-to-youtube.js`:
```
GOOGLE_DRIVE_VIDEOS_FOLDER_ID      # Same value as the Vercel env var — Drive folder watched for new raw video files
YOUTUBE_CLIENT_ID                 # OAuth client (Desktop app type) for YouTube uploads
YOUTUBE_CLIENT_SECRET             # OAuth client secret
YOUTUBE_REFRESH_TOKEN             # One-time-obtained refresh token, see scripts/get-youtube-refresh-token.js
```
The YouTube Data API doesn't accept service-account auth for uploads, so this pipeline runs as a scheduled GitHub Actions workflow (`.github/workflows/sync-drive-videos-to-youtube.yml`), not a Vercel function — uploads can be slow/large enough to risk a function timeout.

Required as a Vercel env var (in addition to the above) so the videos Drive webhook can trigger that workflow instantly instead of waiting for its 6-hour cron:
```
GITHUB_ACTIONS_TOKEN                # Fine-grained GitHub PAT, Actions:read+write on this repo only
```
`/api/webhook-drive-videos` receives the Drive push notification and calls GitHub's `workflow_dispatch` API — it does not perform the upload itself. `webhook_channels.folder_id` tracks which Drive folder each channel watches so `/api/cron/renew-drive-webhooks` can renew multiple Drive folders (photos + videos) generically. That cron also self-heals: any configured folder (`GOOGLE_DRIVE_PHOTOS_FOLDER_ID` / `GOOGLE_DRIVE_VIDEOS_FOLDER_ID`) with no channel row gets a new webhook created on the next run, so a lost or never-created channel recovers within 12 hours.

**Important**: adding `GOOGLE_DRIVE_VIDEOS_FOLDER_ID`/`GITHUB_ACTIONS_TOKEN` to Vercel is not enough on its own — `POST /api/webhooks/setup` (with `WEBHOOK_SETUP_SECRET`) must also be called once to actually create the Google Drive "watch" subscription for the videos folder. Until that call is made, Google has no channel to notify and new videos will silently fall back to the 6-hour cron instead of uploading instantly.

### Vercel Cron Jobs

Configured in `vercel.json`:
- **Daily (00:00)**: Renew webhook subscriptions (`/api/cron/renew-webhooks`)
- **Every 5 minutes**: Sync calendar events (`/api/sync-calendar`)
- **Every 10 minutes**: Sync photos (`/api/sync-photos`)
- **Every hour**: Sync videos (`/api/sync-videos`)

Webhooks provide real-time updates; cron jobs serve as a fallback mechanism.

## Code Style

### Path Aliases
Use `@/*` for absolute imports: `@/components`, `@/lib`, `@/types` (configured in `tsconfig.json`).

### TypeScript Rules
- Explicit return types for exported functions
- Interface over type for object shapes
- Avoid `any`, prefer `unknown` or proper types
- Use optional chaining (`?.`) and nullish coalescing (`??`)

### React Components
- **Server Components by default** (Next.js 16 App Router)
- Only add `"use client"` when using hooks, event handlers, or browser APIs
- Fetch data directly in Server Components using async/await

### Database Types
Prefix database types with `Db`: `DbEvent`, `DbPhoto`, `DbVideo` (defined in `src/lib/db.ts`)

### Error Handling
- **API Routes**: Return JSON with appropriate status codes
- **Server Components**: Use graceful degradation (empty arrays, fallback UI)
- **Library functions**: Return `SyncResult` objects with `{ success, message, details? }`

### Import Order
1. External packages (React, Next.js, third-party)
2. Internal absolute imports using `@/` alias
3. Relative imports (if needed)

## Git Workflow

**CRITICAL**: Never commit or merge directly to `main` branch.

### Required workflow:
1. Create feature branch: `git checkout -b feature/descriptive-name`
2. Make changes and commit to feature branch
3. Push branch: `git push -u origin feature/descriptive-name`
4. Create PR: `gh pr create`
5. Merge via GitHub PR interface (never locally)

Branch naming: `feature/`, `fix/`, `refactor/`, `docs/`

## Key Files

- `src/lib/db.ts` - Database connection, types, and helper functions
- `src/lib/sync.ts` - Sync logic for calendar, photos, videos
- `src/lib/google-calendar.ts` - Google Calendar API integration
- `src/lib/google-drive.ts` - Google Drive API integration
- `src/lib/google-sheets.ts` - Google Sheets API integration
- `src/lib/image-optimizer.ts` - Sharp-based image optimization
- `src/lib/webhooks.ts` - Google webhook setup and renewal
- `src/lib/github-actions.ts` - Triggers the YouTube sync GitHub Actions workflow via `workflow_dispatch`
- `src/instrumentation.ts` / `src/instrumentation-client.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` - Sentry error monitoring init for server, edge, and browser runtimes
- `src/app/global-error.tsx` - Catches React rendering errors in the root layout and reports them to Sentry
- `db/schema.sql` - PostgreSQL database schema
- `scripts/sync-drive-videos-to-youtube.js` - Uploads new Drive videos to YouTube, appends to the Videos sheet (run via GitHub Actions, not Vercel)
- `scripts/get-youtube-refresh-token.js` - One-time local script to obtain the YouTube OAuth refresh token
