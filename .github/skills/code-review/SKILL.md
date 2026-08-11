---
name: code-review
description: Project-specific conventions and pitfalls to check for when reviewing pull requests in this repository. Use this whenever reviewing a pull request or diff in this codebase.
---

This is a Next.js 16 (App Router) site for musician Kelso Kelly. The full
architecture is documented in `CLAUDE.md` and `AGENTS.md` at the repo root —
read those first for broader context. This skill lists the things generic
review misses because they're specific to this codebase.

## Postgres, not Google, is the source of truth for pages

`src/lib/sync.ts` syncs Google Calendar/Drive/Sheets into Postgres (Neon),
and pages read only from Postgres (`src/lib/db.ts`). Flag any change that:

- Has a page or component fetch data directly from a Google API instead of
  from the database — that breaks the "database is the source of truth"
  boundary.
- Adds a new synced field/table without also adding it to `db/schema.sql`
  and to the corresponding `Db*` interface in `src/lib/db.ts`.

## The upsert change-detection pattern must be preserved

Every `upsert*` function in `src/lib/db.ts` (`upsertEvent`, `upsertPhoto`,
`upsertVideo`) uses the same shape:

```sql
INSERT INTO table (...) VALUES (...)
ON CONFLICT (natural_key) DO UPDATE SET ...
WHERE table.col IS DISTINCT FROM EXCLUDED.col OR ...
RETURNING *, (xmax = 0) AS inserted
```

The `WHERE ... IS DISTINCT FROM` clause is intentional: it skips the UPDATE
(and the `updated_at` bump) when nothing actually changed, and callers rely
on the `'created' | 'updated' | 'unchanged'` result to build sync summaries.
When reviewing a diff that adds a new upsert function or adds a column to an
existing one:

- Confirm the `WHERE` clause covers every column being updated (a missed
  column means changes to that column alone won't be detected).
- Confirm the function still returns `{ action, <entity> }` with the same
  three-state `action`, not just a boolean.
- If a `result.length === 0` branch is used to detect "unchanged", confirm it
  re-fetches the existing row (see `upsertEvent`) rather than assuming the
  caller doesn't need it.

## Sync loops handle per-item failure differently — don't assume they're uniform

The three sync functions in `src/lib/sync.ts` are **not** symmetric in how
they handle a single bad item:

- `syncPhotos` wraps each file in its own `try/catch`, incrementing
  `errorCount` and continuing to the next file — one bad image (unsupported
  format, optimize failure) doesn't abort the rest of the sync.
- `syncVideos` wraps the per-item `upsertVideo` call in `try/catch` but
  deliberately **re-throws**, failing the whole sync run on the first bad
  row.
- `syncCalendarEvents` has no per-item `try/catch` around `upsertEvent` at
  all — an error there propagates straight to the function-level catch,
  failing the whole sync.

When reviewing a change to one of these loops, check that it preserves (or
deliberately and correctly changes) that pipeline's existing
failure-isolation behavior, and that `logSync(...)`/`SyncResult` still
reflect the outcome accurately. Also flag:

- Deletion logic that doesn't carry a safety guard analogous to the one in
  `syncCalendarEvents` (skips bulk deletion when it would remove ≥5 items
  *and* >20% of existing rows) — bulk deletes from a sync diff are usually a
  sign of a pagination or API bug, not real user intent.
- Removing or weakening throttling (`shouldSync(...)`) without a `force`
  override for webhook-triggered calls — cron and webhook paths both call
  these functions and rely on throttling to avoid redundant work.

## API routes: auth and response shape

Sync/cron/webhook routes under `src/app/api/` authenticate via
`CRON_SECRET` as a Bearer token (see the `Route Handler with Auth` pattern in
AGENTS.md). Check that:

- New cron/sync endpoints check `Authorization: Bearer ${CRON_SECRET}` (or
  the equivalent webhook verification) before doing any work.
- API routes return JSON with an explicit status code, including on the
  error path (`{ success: false, message }` with a non-200 status), not a
  thrown error left unhandled.
- `webhook-drive-videos` intentionally only triggers a GitHub Actions
  `workflow_dispatch` and does not perform the video upload itself (YouTube
  uploads must run in GitHub Actions, not a Vercel function, due to
  OAuth-only upload auth and function timeout limits) — don't "fix" it by
  inlining the upload.

## Server Components by default

Per CLAUDE.md/AGENTS.md, components are Server Components unless they use
hooks, event handlers, or browser APIs. When reviewing a new/changed
component:

- Question any `"use client"` directive that isn't clearly justified by
  interactivity, hooks, or a browser-only API — prefer pushing the
  client boundary down to the smallest leaf component that needs it.
- Confirm data fetching in Server Components uses direct `async`/`await`
  against `src/lib/db.ts` helpers rather than a client-side `fetch` to an
  internal API route.
- Server Components with fallible data fetches should degrade gracefully
  (empty array/fallback UI on error), not crash the page — see the
  `graceful degradation` pattern in AGENTS.md.

## TypeScript and naming conventions

- Exported functions should have explicit return types.
- Prefer `interface` for object shapes, `type` for unions/intersections.
- No `any` — use `unknown` or a proper type instead.
- Database row types are named `Db*` (`DbEvent`, `DbPhoto`, `DbVideo`,
  `DbSyncLog`) and live in `src/lib/db.ts`; a new table should follow the
  same naming and be added there, not redefined ad hoc elsewhere.
- Imports are ordered: external packages, then `@/*` absolute imports, then
  relative imports. Use the `@/*` path alias instead of deep relative paths
  (`../../../lib/db`).

## Image pipeline

New photos go through `downloadFile` → `optimizeImage` (Sharp, resize to
max 1920px, WebP, 85% quality) → Vercel Blob upload, in that order (see
`syncPhotos` in `src/lib/sync.ts` and `src/lib/image-optimizer.ts`).
Existing photos intentionally skip re-download/re-optimize/re-upload and
only refresh metadata — flag a change that re-processes existing photos on
every sync, since that's an expensive, deliberately-avoided cost.

## Non-goals for this skill

Don't re-review formatting/lint issues that `npm run lint` and
`npx tsc --noEmit` already catch, and don't flag the repo's git workflow
(feature branches, no direct pushes to `main`) — that's enforced by
process, not something a diff review can fix.
