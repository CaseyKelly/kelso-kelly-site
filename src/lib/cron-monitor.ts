import * as Sentry from '@sentry/nextjs';

/**
 * Sentry Cron Monitoring for the jobs in vercel.json.
 *
 * Schedules here must match vercel.json exactly (cron-monitor.test.ts checks
 * that), because Sentry raises a "missed" alert whenever a check-in doesn't
 * arrive on this schedule (plus checkinMargin).
 */

export interface CronMonitorConfig {
  slug: string;
  /** Crontab expression, identical to the one in vercel.json (UTC) */
  schedule: string;
  /** Minutes after the scheduled time before a missing check-in counts as missed */
  checkinMargin: number;
  /** Minutes an in-progress check-in may run before it counts as timed out */
  maxRuntime: number;
}

// Vercel Pro runs crons within the scheduled minute, so a few minutes of
// margin is enough. maxRuntime is comfortably above each route's maxDuration.
export const CRON_MONITORS = {
  '/api/cron/renew-webhooks': {
    slug: 'renew-webhooks',
    schedule: '0 0 * * *',
    checkinMargin: 5,
    maxRuntime: 10,
  },
  '/api/cron/renew-drive-webhooks': {
    slug: 'renew-drive-webhooks',
    schedule: '0 */12 * * *',
    checkinMargin: 5,
    maxRuntime: 10,
  },
  '/api/sync-calendar': {
    slug: 'sync-calendar',
    schedule: '0 */2 * * *',
    checkinMargin: 5,
    maxRuntime: 5,
  },
  '/api/sync-photos': {
    slug: 'sync-photos',
    schedule: '0 */6 * * *',
    checkinMargin: 5,
    maxRuntime: 10,
  },
  '/api/sync-videos': {
    slug: 'sync-videos',
    schedule: '0 */4 * * *',
    checkinMargin: 5,
    maxRuntime: 5,
  },
} as const satisfies Record<string, CronMonitorConfig>;

/**
 * Whether this request came from Vercel Cron rather than a webhook or a
 * manual call. Only used to decide whether to send a check-in, never for
 * auth (that's the CRON_SECRET bearer check, which runs first).
 */
export function isVercelCronRequest(request: Request): boolean {
  return (request.headers.get('user-agent') ?? '').toLowerCase().startsWith('vercel-cron');
}

/** A 2xx response whose JSON body doesn't report `success: false` */
async function isSuccessfulResponse(response: Response): Promise<boolean> {
  if (!response.ok) return false;
  try {
    const body: unknown = await response.clone().json();
    return !(typeof body === 'object' && body !== null && (body as { success?: unknown }).success === false);
  } catch {
    return true;
  }
}

class CronJobFailedError extends Error {
  constructor(readonly response: Response) {
    super(`Cron job returned a failure response (HTTP ${response.status})`);
    this.name = 'CronJobFailedError';
  }
}

/**
 * Run a cron route's job, wrapped in a Sentry check-in when Vercel Cron
 * invoked it. A thrown error or a failure response marks the check-in as
 * failed; the handler's response is returned to the caller either way.
 */
export async function withCronMonitor<T extends Response>(
  request: Request,
  monitor: CronMonitorConfig,
  job: () => Promise<T>
): Promise<T> {
  if (!isVercelCronRequest(request)) {
    return job();
  }

  try {
    return await Sentry.withMonitor(
      monitor.slug,
      async () => {
        const response = await job();
        if (!(await isSuccessfulResponse(response))) {
          throw new CronJobFailedError(response);
        }
        return response;
      },
      {
        schedule: { type: 'crontab', value: monitor.schedule },
        checkinMargin: monitor.checkinMargin,
        maxRuntime: monitor.maxRuntime,
        timezone: 'UTC',
      }
    );
  } catch (error) {
    if (error instanceof CronJobFailedError) {
      return error.response as T;
    }
    throw error;
  } finally {
    // Serverless functions can freeze right after responding; make sure the
    // closing check-in actually leaves before that.
    await Sentry.flush(2000);
  }
}
