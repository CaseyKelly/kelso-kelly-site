import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { CRON_MONITORS, isVercelCronRequest, withCronMonitor } from './cron-monitor';

vi.mock('@sentry/nextjs', () => ({
  withMonitor: vi.fn((_slug: string, callback: () => unknown) => callback()),
  flush: vi.fn().mockResolvedValue(true),
}));

const mockedWithMonitor = vi.mocked(Sentry.withMonitor);
const monitor = CRON_MONITORS['/api/sync-calendar'];

function cronRequest(): Request {
  return new Request('http://localhost/api/sync-calendar', {
    headers: { 'user-agent': 'vercel-cron/1.0' },
  });
}

beforeEach(() => {
  mockedWithMonitor.mockClear();
});

describe('CRON_MONITORS', () => {
  it('has a monitor for every vercel.json cron, with the exact same schedule', () => {
    const vercelConfig = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };
    const fromVercel = Object.fromEntries(vercelConfig.crons.map((c) => [c.path, c.schedule]));
    const fromMonitors = Object.fromEntries(
      Object.entries(CRON_MONITORS).map(([path, config]) => [path, config.schedule])
    );
    expect(fromMonitors).toEqual(fromVercel);
  });

  it('uses unique slugs', () => {
    const slugs = Object.values(CRON_MONITORS).map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('isVercelCronRequest', () => {
  it('recognises the Vercel Cron user agent', () => {
    expect(isVercelCronRequest(cronRequest())).toBe(true);
  });

  it('ignores other callers', () => {
    expect(isVercelCronRequest(new Request('http://localhost', { headers: { 'user-agent': 'curl/8.0' } }))).toBe(false);
    expect(isVercelCronRequest(new Request('http://localhost'))).toBe(false);
  });
});

describe('withCronMonitor', () => {
  it('skips the check-in for non-cron requests', async () => {
    const response = await withCronMonitor(new Request('http://localhost'), monitor, async () =>
      NextResponse.json({ success: true })
    );
    expect(response.status).toBe(200);
    expect(mockedWithMonitor).not.toHaveBeenCalled();
  });

  it('wraps cron requests with the monitor config', async () => {
    const response = await withCronMonitor(cronRequest(), monitor, async () =>
      NextResponse.json({ success: true })
    );
    expect(response.status).toBe(200);
    expect(mockedWithMonitor).toHaveBeenCalledWith('sync-calendar', expect.any(Function), {
      schedule: { type: 'crontab', value: '0 */2 * * *' },
      checkinMargin: 5,
      maxRuntime: 5,
      timezone: 'UTC',
    });
    expect(Sentry.flush).toHaveBeenCalled();
  });

  it('fails the check-in on an error status but still returns the response', async () => {
    let callbackOutcome: 'resolved' | 'rejected' | undefined;
    mockedWithMonitor.mockImplementationOnce(((_slug: string, callback: () => Promise<unknown>) =>
      callback().then(
        (r) => {
          callbackOutcome = 'resolved';
          return r;
        },
        (e) => {
          callbackOutcome = 'rejected';
          throw e;
        }
      )) as typeof Sentry.withMonitor);

    const response = await withCronMonitor(cronRequest(), monitor, async () =>
      NextResponse.json({ success: false, message: 'down' }, { status: 500 })
    );
    expect(callbackOutcome).toBe('rejected');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, message: 'down' });
  });

  it('fails the check-in on a 200 whose body reports success: false', async () => {
    let rejected = false;
    mockedWithMonitor.mockImplementationOnce(((_slug: string, callback: () => Promise<unknown>) =>
      callback().catch((e) => {
        rejected = true;
        throw e;
      })) as typeof Sentry.withMonitor);

    const response = await withCronMonitor(cronRequest(), monitor, async () =>
      NextResponse.json({ success: false, failed: 1 })
    );
    expect(rejected).toBe(true);
    expect(response.status).toBe(200);
  });

  it('rethrows unexpected errors from the job', async () => {
    await expect(
      withCronMonitor(cronRequest(), monitor, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });
});
