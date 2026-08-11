import { describe, it, expect } from 'vitest';
import { parseLocation, parseDescription, formatTime, formatDate } from './google-calendar';

describe('parseLocation', () => {
  it('returns nothing for a missing location', () => {
    expect(parseLocation(undefined)).toEqual({});
    expect(parseLocation(null)).toEqual({});
    expect(parseLocation('')).toEqual({});
  });

  it('treats a single-part location as the venue only', () => {
    expect(parseLocation('The Aggie Theatre')).toEqual({ venue: 'The Aggie Theatre' });
  });

  it('splits a comma-separated location into venue and full address', () => {
    expect(parseLocation('The Aggie Theatre, 204 S College Ave, Fort Collins, CO')).toEqual({
      venue: 'The Aggie Theatre',
      address: 'The Aggie Theatre, 204 S College Ave, Fort Collins, CO',
    });
  });

  it('trims whitespace around the venue name', () => {
    expect(parseLocation('  The Aggie Theatre  , 204 S College Ave')).toEqual({
      venue: 'The Aggie Theatre',
      address: '  The Aggie Theatre  , 204 S College Ave',
    });
  });
});

describe('parseDescription', () => {
  it('returns nothing for a missing description', () => {
    expect(parseDescription(undefined)).toEqual({});
    expect(parseDescription(null)).toEqual({});
    expect(parseDescription('')).toEqual({});
  });

  it('passes through description text with no ticket URL when none is present', () => {
    expect(parseDescription('Come see the show!')).toEqual({
      description: 'Come see the show!',
      ticketUrl: undefined,
    });
  });

  it('extracts a URL that matches a ticket-related keyword', () => {
    const result = parseDescription('Get tickets at https://eventbrite.com/e/12345 - see you there!');
    expect(result.ticketUrl).toBe('https://eventbrite.com/e/12345');
    expect(result.description).toContain('Get tickets');
  });

  it('recognizes seetickets and generic "event"/"ticket" URLs', () => {
    expect(parseDescription('https://seetickets.us/show/1').ticketUrl).toBe('https://seetickets.us/show/1');
    expect(parseDescription('https://venue.com/ticket-info').ticketUrl).toBe('https://venue.com/ticket-info');
    expect(parseDescription('https://venue.com/event-details').ticketUrl).toBe('https://venue.com/event-details');
  });

  it('does not treat an unrelated URL as a ticket URL', () => {
    const result = parseDescription('More info at https://kelsokellymusic.com');
    expect(result.ticketUrl).toBeUndefined();
  });

  it('picks the first matching URL when multiple URLs are present', () => {
    const result = parseDescription(
      'Info: https://kelsokellymusic.com and tickets: https://eventbrite.com/e/1'
    );
    expect(result.ticketUrl).toBe('https://eventbrite.com/e/1');
  });
});

describe('formatTime', () => {
  it('returns TBD when neither dateTime nor date is provided', () => {
    expect(formatTime(undefined, undefined)).toBe('TBD');
    expect(formatTime(null, null)).toBe('TBD');
  });

  it('returns "All Day" for an all-day event (date only, no dateTime)', () => {
    expect(formatTime(undefined, '2026-08-15')).toBe('All Day');
    expect(formatTime(null, '2026-08-15')).toBe('All Day');
  });

  it('converts a UTC dateTime to Mountain Time', () => {
    // 2026-08-15T02:00:00Z is 2026-08-14 8:00 PM MDT (UTC-6 in August, DST)
    const result = formatTime('2026-08-15T02:00:00Z', '2026-08-15');
    expect(result).toBe('8:00 PM');
  });

  it('converts a winter (standard time) UTC dateTime correctly', () => {
    // 2026-01-15T02:00:00Z is 2026-01-14 7:00 PM MST (UTC-7, no DST)
    const result = formatTime('2026-01-15T02:00:00Z', '2026-01-15');
    expect(result).toBe('7:00 PM');
  });
});

describe('formatDate', () => {
  it('prefers the plain date field when present', () => {
    expect(formatDate('2026-08-15T02:00:00Z', '2026-08-14')).toBe('2026-08-14');
  });

  it('falls back to the date portion of dateTime when date is absent', () => {
    expect(formatDate('2026-08-15T02:00:00Z', undefined)).toBe('2026-08-15');
  });

  it('falls back to today when neither is provided', () => {
    const todayIso = new Date().toISOString().split('T')[0];
    expect(formatDate(undefined, undefined)).toBe(todayIso);
  });
});
