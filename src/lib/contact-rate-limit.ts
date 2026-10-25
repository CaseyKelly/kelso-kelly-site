/**
 * Per-IP rate limit for the contact form, backed by the contact_rate_limits
 * table so the limit is shared by every serverless instance.
 *
 * (src/lib/sync-throttle.ts reads the last sync time and decides in app code,
 * which is fine for crons but racy for a public endpoint, so this uses a
 * single atomic upsert instead.)
 */

import { incrementContactRateLimit } from './db';

export const CONTACT_RATE_LIMIT_MAX = 5;
export const CONTACT_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the client may retry; set only when not allowed */
  retryAfterSeconds?: number;
}

/**
 * Best-effort client IP. On Vercel the platform sets x-forwarded-for (first
 * entry is the client) and x-real-ip itself, so clients can't spoof them.
 */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwardedFor || headers.get('x-real-ip')?.trim() || 'unknown';
  // Matches contact_rate_limits.ip VARCHAR(64); an IPv6 address is at most 45 chars.
  return ip.slice(0, 64);
}

/**
 * Count this request against the IP's hourly allowance. Fails open: if the
 * database is unreachable the message is allowed through rather than
 * silently losing a real booking inquiry.
 */
export async function checkContactRateLimit(ip: string): Promise<RateLimitDecision> {
  try {
    const { count, retryAfterSeconds } = await incrementContactRateLimit(
      ip,
      CONTACT_RATE_LIMIT_WINDOW_SECONDS
    );
    if (count > CONTACT_RATE_LIMIT_MAX) {
      return { allowed: false, retryAfterSeconds };
    }
    return { allowed: true };
  } catch (error) {
    console.warn('Contact rate limit check failed, allowing request:', error);
    return { allowed: true };
  }
}
