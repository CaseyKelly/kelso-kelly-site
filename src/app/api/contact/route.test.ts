import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

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

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  eventType: 'Wedding',
  date: '2026-09-01',
  message: 'Would love to book you!',
  newsletter: true,
};

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
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
    expect(json.message).toContain('Resend API unavailable');
  });

  it('omits the event type from the subject when not provided', async () => {
    await POST(makeRequest({ ...validBody, eventType: '' }));
    const sentEmail = mockSend.mock.calls[0][0];
    expect(sentEmail.subject).toBe('New Contact Form: General Inquiry - Jane Doe');
  });
});
