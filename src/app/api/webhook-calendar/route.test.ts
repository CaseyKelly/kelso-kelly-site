import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { syncCalendarEvents } from '@/lib/sync';

vi.mock('@/lib/sync', () => ({
  syncCalendarEvents: vi.fn(),
}));

const mockedSync = vi.mocked(syncCalendarEvents);

function makeRequest(headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/webhook-calendar', { method: 'POST', headers });
}

beforeEach(() => {
  mockedSync.mockReset();
});

describe('POST /api/webhook-calendar', () => {
  it('acknowledges a sync-confirmation message without triggering a sync', async () => {
    const response = await POST(makeRequest({ 'x-goog-resource-state': 'sync' }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true });
    expect(mockedSync).not.toHaveBeenCalled();
  });

  it('triggers a forced sync on a real change notification', async () => {
    mockedSync.mockResolvedValue({ success: true, message: 'synced', details: { created: 1 } });
    const response = await POST(makeRequest({ 'x-goog-resource-state': 'exists' }));
    const json = await response.json();
    expect(mockedSync).toHaveBeenCalledWith(true);
    expect(response.status).toBe(200);
    expect(json.synced).toBe(true);
  });

  it('still returns 200 when the sync reports failure, to prevent Google retry storms', async () => {
    mockedSync.mockResolvedValue({ success: false, message: 'Calendar API down' });
    const response = await POST(makeRequest({ 'x-goog-resource-state': 'exists' }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.synced).toBe(false);
    expect(json.error).toContain('Calendar API down');
  });

  it('still returns 200 when the sync throws unexpectedly', async () => {
    mockedSync.mockRejectedValue(new Error('unexpected crash'));
    const response = await POST(makeRequest({ 'x-goog-resource-state': 'exists' }));
    expect(response.status).toBe(200);
  });

  it('acknowledges with 200 even if header parsing/processing throws before reaching sync', async () => {
    // No resource-state header at all -> falls through to the generic ack path
    const response = await POST(makeRequest({}));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true });
  });
});
