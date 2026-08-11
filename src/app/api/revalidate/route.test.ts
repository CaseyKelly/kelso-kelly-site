import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { revalidatePath } from 'next/cache';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const mockedRevalidate = vi.mocked(revalidatePath);

beforeEach(() => {
  mockedRevalidate.mockReset();
  delete process.env.REVALIDATE_SECRET;
});

describe('POST /api/revalidate', () => {
  function makeRequest(url: string, body: unknown) {
    return new NextRequest(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('rejects an incorrect secret when REVALIDATE_SECRET is configured', async () => {
    process.env.REVALIDATE_SECRET = 'super-secret';
    const response = await POST(makeRequest('http://localhost/api/revalidate?secret=wrong', {}));
    expect(response.status).toBe(401);
    expect(mockedRevalidate).not.toHaveBeenCalled();
  });

  it('defaults to /schedule and /media when no path is given', async () => {
    const response = await POST(makeRequest('http://localhost/api/revalidate', {}));
    const json = await response.json();
    expect(json.paths).toEqual(['/schedule', '/media']);
    expect(mockedRevalidate).toHaveBeenCalledWith('/schedule');
    expect(mockedRevalidate).toHaveBeenCalledWith('/media');
  });

  it('revalidates a single provided path', async () => {
    const response = await POST(makeRequest('http://localhost/api/revalidate', { path: '/songs' }));
    const json = await response.json();
    expect(json.paths).toEqual(['/songs']);
    expect(mockedRevalidate).toHaveBeenCalledWith('/songs');
    expect(mockedRevalidate).toHaveBeenCalledTimes(1);
  });

  it('revalidates every path in a provided paths array', async () => {
    await POST(makeRequest('http://localhost/api/revalidate', { paths: ['/a', '/b', '/c'] }));
    expect(mockedRevalidate).toHaveBeenCalledTimes(3);
  });
});

describe('GET /api/revalidate', () => {
  function makeRequest(url: string) {
    return new NextRequest(url);
  }

  it('rejects an incorrect secret', async () => {
    process.env.REVALIDATE_SECRET = 'super-secret';
    const response = await GET(makeRequest('http://localhost/api/revalidate?secret=wrong'));
    expect(response.status).toBe(401);
  });

  it('defaults to "/" when no path query param is given', async () => {
    const response = await GET(makeRequest('http://localhost/api/revalidate'));
    const json = await response.json();
    expect(json.path).toBe('/');
    expect(mockedRevalidate).toHaveBeenCalledWith('/');
  });

  it('revalidates the path given as a query param', async () => {
    const response = await GET(makeRequest('http://localhost/api/revalidate?path=/schedule'));
    const json = await response.json();
    expect(json.path).toBe('/schedule');
    expect(mockedRevalidate).toHaveBeenCalledWith('/schedule');
  });

  it('accepts a matching secret', async () => {
    process.env.REVALIDATE_SECRET = 'super-secret';
    const response = await GET(makeRequest('http://localhost/api/revalidate?path=/media&secret=super-secret'));
    expect(response.status).toBe(200);
  });
});
