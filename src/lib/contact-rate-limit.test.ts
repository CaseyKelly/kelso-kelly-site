import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkContactRateLimit,
  getClientIp,
  CONTACT_RATE_LIMIT_MAX,
  CONTACT_RATE_LIMIT_WINDOW_SECONDS,
} from './contact-rate-limit';
import { incrementContactRateLimit } from './db';

vi.mock('./db', () => ({
  incrementContactRateLimit: vi.fn(),
}));

const mockedIncrement = vi.mocked(incrementContactRateLimit);

beforeEach(() => {
  mockedIncrement.mockReset();
});

describe('getClientIp', () => {
  it('uses the first x-forwarded-for entry', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'x-real-ip': '10.0.0.2' });
    expect(getClientIp(headers)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip', () => {
    expect(getClientIp(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
  });

  it('returns "unknown" when neither header is present', () => {
    expect(getClientIp(new Headers())).toBe('unknown');
  });

  it('truncates absurdly long values to fit the column', () => {
    const headers = new Headers({ 'x-forwarded-for': 'a'.repeat(500) });
    expect(getClientIp(headers)).toHaveLength(64);
  });
});

describe('checkContactRateLimit', () => {
  it('allows requests up to the limit', async () => {
    mockedIncrement.mockResolvedValue({ count: CONTACT_RATE_LIMIT_MAX, retryAfterSeconds: 100 });
    await expect(checkContactRateLimit('1.2.3.4')).resolves.toEqual({ allowed: true });
    expect(mockedIncrement).toHaveBeenCalledWith('1.2.3.4', CONTACT_RATE_LIMIT_WINDOW_SECONDS);
  });

  it('blocks once the limit is exceeded and passes through Retry-After', async () => {
    mockedIncrement.mockResolvedValue({ count: CONTACT_RATE_LIMIT_MAX + 1, retryAfterSeconds: 1234 });
    await expect(checkContactRateLimit('1.2.3.4')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 1234,
    });
  });

  it('fails open when the database errors', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockedIncrement.mockRejectedValue(new Error('connection refused'));
    await expect(checkContactRateLimit('1.2.3.4')).resolves.toEqual({ allowed: true });
  });
});
