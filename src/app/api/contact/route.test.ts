import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockSend, mockIncrement } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockIncrement: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  incrementContactRateLimit: mockIncrement,
}));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function MockResend() {
    return { emails: { send: mockSend } };
  }),
}));

// contact/route.ts validates these env vars at module import time.
process.env.RESEND_API_KEY = 'test-key';
process.env.RESEND_FROM_EMAIL = 'noreply@example.com';
process.env.CONTACT_EMAIL = 'bookings@example.com';

const { POST } = await import('./route');

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const validBody = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  eventType: 'Wedding',
  date: '2026-09-01',
  message: 'Would love to book you!',
  newsletter: true,
  // Spam-check fields a real form sends (see src/lib/contact-spam.ts)
  website: '',
  formElapsedMs: 12_000,
};

const FAKE_SUCCESS = { success: true, message: 'Message sent successfully' };

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  mockIncrement.mockReset();
  mockIncrement.mockResolvedValue({ count: 1, retryAfterSeconds: 3600 });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('POST /api/contact', () => {
  it('sends the email and returns 200 for a valid submission', async () => {
    const response = await POST(makeRequest(validBody));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, message: 'Message sent successfully' });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@example.com',
        to: 'bookings@example.com',
        replyTo: 'jane@example.com',
        subject: 'New Contact Form: Wedding - Jane Doe',
      })
    );
  });

  it('returns 400 when a required field is missing', async () => {
    const response = await POST(makeRequest({ ...validBody, message: '' }));
    expect(response.status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid email address', async () => {
    const response = await POST(makeRequest({ ...validBody, email: 'not-an-email' }));
    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json.message).toBe('Invalid email address');
  });

  it('strips angle brackets from name and message to prevent injection', async () => {
    await POST(
      makeRequest({ ...validBody, name: '<script>evil</script>Jane', message: 'Hi <b>there</b>' })
    );
    const sentEmail = mockSend.mock.calls[0][0];
    expect(sentEmail.text).not.toContain('<');
    expect(sentEmail.text).not.toContain('>');
    expect(sentEmail.subject).not.toContain('<');
  });

  it('returns 500 when Resend fails to send', async () => {
    mockSend.mockRejectedValue(new Error('Resend API unavailable'));
    const response = await POST(makeRequest(validBody));
    const json = await response.json();
    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    // Provider error details stay in the server logs, not the response
    expect(json.message).toBe('Failed to send message');
  });

  it('omits the event type from the subject when not provided', async () => {
    await POST(makeRequest({ ...validBody, eventType: '' }));
    const sentEmail = mockSend.mock.calls[0][0];
    expect(sentEmail.subject).toBe('New Contact Form: General Inquiry - Jane Doe');
  });

  it('returns 400 for a body that is not a JSON object', async () => {
    expect((await POST(makeRequest('not json'))).status).toBe(400);
    expect((await POST(makeRequest([1, 2]))).status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 400 when a field has the wrong type', async () => {
    const response = await POST(makeRequest({ ...validBody, name: { first: 'Jane' } }));
    expect(response.status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 400 when a field is too long', async () => {
    const response = await POST(makeRequest({ ...validBody, message: 'a'.repeat(5001) }));
    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json.message).toBe('message must be at most 5000 characters');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('strips line breaks from the subject line', async () => {
    await POST(makeRequest({ ...validBody, name: 'Jane\r\nBcc: x@example.com' }));
    expect(mockSend.mock.calls[0][0].subject).toBe('New Contact Form: Wedding - Jane Bcc: x@example.com');
  });

  describe('spam protection', () => {
    it('fakes success without sending when the honeypot is filled in', async () => {
      const response = await POST(makeRequest({ ...validBody, website: 'http://spam.example' }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(FAKE_SUCCESS);
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockIncrement).not.toHaveBeenCalled();
    });

    it('fakes success without sending when submitted faster than 3 seconds', async () => {
      const response = await POST(makeRequest({ ...validBody, formElapsedMs: 800 }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(FAKE_SUCCESS);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('fakes success without sending when the timing field is missing (direct API post)', async () => {
      const withoutTiming: Partial<typeof validBody> = { ...validBody };
      delete withoutTiming.formElapsedMs;
      const response = await POST(makeRequest(withoutTiming));
      expect(response.status).toBe(200);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('rate limits by the client IP from x-forwarded-for', async () => {
      await POST(makeRequest(validBody, { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }));
      expect(mockIncrement).toHaveBeenCalledWith('203.0.113.9', 3600);
    });

    it('returns 429 with Retry-After once the IP is over the limit', async () => {
      mockIncrement.mockResolvedValue({ count: 6, retryAfterSeconds: 1800 });
      const response = await POST(makeRequest(validBody, { 'x-real-ip': '198.51.100.2' }));
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('1800');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('still sends when the rate limit store is unavailable (fails open)', async () => {
      mockIncrement.mockRejectedValue(new Error('db down'));
      const response = await POST(makeRequest(validBody));
      expect(response.status).toBe(200);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('does not count invalid submissions against the limit', async () => {
      await POST(makeRequest({ ...validBody, email: 'nope' }));
      expect(mockIncrement).not.toHaveBeenCalled();
    });
  });
});
