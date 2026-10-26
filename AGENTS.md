# Agent Guidelines for kelso-kelly-music

This document provides coding guidelines and project information for AI agents working in this repository.

## Project Overview

A Next.js 16 website for musician Kelso Kelly, featuring:

- Event calendar synced from Google Calendar
- Photo gallery synced from Google Drive
- Video gallery synced from Google Sheets
- Automated webhooks for real-time content updates
- PostgreSQL database (Neon) for data storage
- Vercel Blob Storage for optimized images

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Neon PostgreSQL, Google APIs

## Git Workflow (CRITICAL)

**NEVER commit or merge directly to the `main` branch.**

### Required Workflow for ALL Changes:

1. **Always work on a feature branch:**

   ```bash
   git checkout -b feature/descriptive-name
   # or: git checkout -b fix/bug-description
   ```

2. **After making changes, create a PR:**
   - Commit your changes to the feature branch
   - Push the branch: `git push -u origin feature/descriptive-name`
   - Create a pull request using: `gh pr create`
   - **DO NOT merge locally or push directly to main**

3. **Branch naming conventions:**
   - Features: `feature/feature-name`
   - Bug fixes: `fix/bug-description`
   - Refactoring: `refactor/description`
   - Documentation: `docs/description`

4. **Never use:**
   - `git push origin main`
   - `git merge` to main while on main branch
   - `--force` or `--force-with-lease` on main branch

## Build, Lint, and Test Commands

### Development

```bash
npm run dev          # Start dev server on http://localhost:3000
npm run build        # Production build
npm start            # Start production server
npm run lint         # Run ESLint on all files
npm run typecheck    # Type check (tsc --noEmit)
npm run format       # Format with Prettier; format:check only verifies
```

Node 24 (`engines.node` in `package.json`; CI reads the version from there). Install with `npm ci`; never hand-edit `package-lock.json`, regenerate it with `npm install`.

### Testing

```bash
npm test                 # Vitest unit tests, no database needed
npm run test:coverage    # Same, with v8 coverage (what CI runs)
npm run test:integration # Vitest DB integration tests, needs Postgres
npm run test:e2e         # Playwright E2E, needs Postgres
```

- **Unit tests** are `*.test.ts(x)` files next to their source. The default environment is Node; component tests opt into jsdom with a `// @vitest-environment jsdom` docblock. Run one file with `npm test -- path/to/file.test.ts`.
- **Integration tests** are `*.integration.test.ts` files (config: `vitest.integration.config.ts`). They need a disposable Postgres at `TEST_DATABASE_URL` (default `postgresql://postgres:postgres@localhost:5432/postgres`, e.g. `docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:18`). Setup loads `db/schema.sql`, truncates the app tables and starts `scripts/neon-http-bridge.js`, so the unmodified Neon driver in `src/lib/db.ts` runs against plain Postgres.
- **E2E tests** live in `e2e/`. Playwright's `webServer` runs `scripts/e2e-server.js`, which seeds the same Postgres from `db/schema.sql` + `db/test-seed.sql`, starts the bridge, then runs `next build` and `next start`. With a preinstalled Chromium, set `PW_CHROMIUM_PATH` to its executable instead of running `npx playwright install`.

### Before You Push

Run what CI runs, and push only when all of it passes:

```bash
npm run format:check     # fix with `npm run format`
npm run lint
npm run typecheck
npm test
npm run test:integration # needs Postgres
npm run build            # needs RESEND_API_KEY, RESEND_FROM_EMAIL, CONTACT_EMAIL (placeholders are fine)
npm run test:e2e         # needs Postgres; builds the app itself
```

## Code Style Guidelines

### Import Order

```typescript
// 1. External packages (React, Next.js, third-party)
import { useState } from 'react';
import Link from 'next/link';
import { Calendar } from 'lucide-react';

// 2. Internal absolute imports using @ alias
import { Button } from '@/components/ui/Button';
import { getEvents } from '@/lib/db';
import { formatDate } from '@/lib/utils';
import type { Event } from '@/types';

// 3. Relative imports (if needed)
import { localHelper } from './helpers';
```

### Path Aliases

- Use `@/*` for absolute imports: `@/components`, `@/lib`, `@/types`
- Defined in `tsconfig.json` paths configuration

### TypeScript

**Strict mode is enabled.** Follow these rules:

1. **Explicit return types for exported functions:**

   ```typescript
   export async function getEvents(): Promise<DbEvent[]> { ... }
   export function formatDate(date: string): string { ... }
   ```

2. **Interface over type for object shapes:**

   ```typescript
   // Preferred
   export interface Event {
     id: string;
     title: string;
   }

   // Use type for unions/intersections
   export type Status = 'upcoming' | 'cancelled' | 'sold-out';
   ```

3. **Avoid `any`, use `unknown` or proper types:**

   ```typescript
   // Bad
   let data: any = await fetch();

   // Good
   const data: DbEvent[] = await getEvents();
   ```

4. **Use optional chaining and nullish coalescing:**
   ```typescript
   const venue = event.venue ?? 'TBA';
   const address = event.address ?? null;
   ```

### React Components

1. **Server Components by default** (Next.js 16 App Router)
   - Only add `"use client"` when using hooks, event handlers, or browser APIs
   - Fetch data directly in Server Components

2. **Component structure:**

   ```typescript
   import type { ComponentProps } from "react";

   interface ButtonProps {
     children: React.ReactNode;
     variant?: "primary" | "secondary";
     className?: string;
   }

   export function Button({ children, variant = "primary", className }: ButtonProps) {
     return <button className={cn(baseStyles, className)}>{children}</button>;
   }
   ```

3. **Use Tailwind utility classes** (no CSS modules or styled-components)
   - Use `cn()` helper from `@/lib/utils` for conditional classes
   - Follow Tailwind's responsive modifiers: `sm:`, `md:`, `lg:`

4. **Async Server Components:**
   ```typescript
   export default async function Page() {
     const events = await getEvents(); // Direct async/await
     return <div>{events.map(...)}</div>;
   }
   ```

### Naming Conventions

- **Components:** PascalCase (`EventCard.tsx`, `Button.tsx`)
- **Files:** kebab-case for routes (`sync-calendar/route.ts`)
- **Functions:** camelCase (`formatDate`, `getUpcomingEvents`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_EVENTS`, `API_URL`)
- **Interfaces/Types:** PascalCase (`Event`, `DbPhoto`, `SyncResult`)
- **Database types:** Prefix with `Db` (`DbEvent`, `DbPhoto`)

### Error Handling

1. **API Routes - return JSON with status:**

   ```typescript
   export async function POST(request: NextRequest) {
     try {
       const result = await syncData();
       return NextResponse.json(result, { status: 200 });
     } catch (error) {
       console.error('Error:', error);
       return NextResponse.json({ success: false, message: `${error}` }, { status: 500 });
     }
   }
   ```

2. **Server Components - graceful degradation:**

   ```typescript
   export default async function Page() {
     let events: DbEvent[] = [];
     try {
       events = await getEvents();
     } catch (error) {
       console.warn('Unable to fetch events:', error);
       // Render fallback UI
     }
     return <div>...</div>;
   }
   ```

3. **Library functions - return result objects:**
   ```typescript
   export interface SyncResult {
     success: boolean;
     message: string;
     details?: any;
   }

   export async function syncData(): Promise<SyncResult> {
     try {
       // ... sync logic
       return { success: true, message: 'Synced successfully' };
     } catch (error) {
       return { success: false, message: `${error}` };
     }
   }
   ```

### Database Patterns

1. **Use parameterized queries** (sql template tag from `@neondatabase/serverless`):

   ```typescript
   const events = await sql`SELECT * FROM events WHERE date >= ${date}`;
   ```

2. **Upsert pattern for sync operations:**

   ```typescript
   const result = await sql`
     INSERT INTO table (id, data) VALUES (${id}, ${data})
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
     WHERE table.data IS DISTINCT FROM EXCLUDED.data
     RETURNING *, (xmax = 0) AS inserted
   `;
   ```

3. **Type database results:**
   ```typescript
   const result = await sql`SELECT * FROM events`;
   return result as DbEvent[];
   ```

## File Organization

```
src/
  app/              # Next.js App Router pages & API routes
    (site)/         # Route group for public pages
    api/            # API endpoints
  components/
    layout/         # Layout components (Header, Footer)
    ui/             # Reusable UI components
  lib/              # Utility functions and integrations
  types/            # TypeScript type definitions
  data/             # Static data and configuration
db/
  schema.sql        # Database schema
```

## Environment Variables

Required for local development (in `.env.local`):

- `DATABASE_URL` - Neon PostgreSQL connection string
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Service account email
- `GOOGLE_PRIVATE_KEY` - Service account private key
- `GOOGLE_CALENDAR_ID` - Calendar to sync from
- `GOOGLE_DRIVE_PHOTOS_FOLDER_ID` - Photos folder ID
- `GOOGLE_VIDEOS_SHEET_ID` - Videos spreadsheet ID

## Key Architecture Decisions

1. **No client-side state management** - Use React Server Components and fetch data server-side
2. **Optimistic UI updates via revalidation** - Use `revalidatePath()` after data mutations
3. **Webhook-based sync** - Google webhooks trigger `/api/webhook-*` endpoints
4. **Static generation with ISR** - Pages use `revalidate` for Incremental Static Regeneration
5. **Database as source of truth** - Google services sync TO database, pages read FROM database

## Common Patterns

### Route Handler with Auth

```typescript
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... handle request
}
```

### ISR Configuration

```typescript
export const revalidate = 60; // Revalidate every 60 seconds
export const dynamic = 'force-dynamic'; // For API routes
export const maxDuration = 60; // Max execution time
```

## Cron Jobs (Vercel)

Configured in `vercel.json`:

- Renew webhooks: Daily at 00:00 UTC
- Renew Drive webhooks (and recreate missing ones): Every 12 hours
- Sync calendar: Every 2 hours
- Sync photos: Every 6 hours
- Sync videos: Every 4 hours

## Resources

- [Next.js 16 Docs](https://nextjs.org/docs)
- [Tailwind CSS 4](https://tailwindcss.com/docs)
- [Neon Database](https://neon.tech/docs)
- Repository: `git@github.com:CaseyKelly/kelso-kelly-site.git`
