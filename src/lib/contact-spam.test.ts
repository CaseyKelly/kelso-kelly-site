import { describe, it, expect } from 'vitest';
import { detectBot, CONTACT_HONEYPOT_FIELD, CONTACT_ELAPSED_FIELD, MIN_SUBMIT_ELAPSED_MS } from './contact-spam';

const human = { [CONTACT_HONEYPOT_FIELD]: '', [CONTACT_ELAPSED_FIELD]: 15_000 };

describe('detectBot', () => {
  it('passes a human-looking submission', () => {
    expect(detectBot(human)).toBeNull();
  });

  it('passes when the honeypot field is omitted entirely', () => {
    expect(detectBot({ [CONTACT_ELAPSED_FIELD]: 15_000 })).toBeNull();
  });

  it('flags a filled-in honeypot', () => {
    expect(detectBot({ ...human, [CONTACT_HONEYPOT_FIELD]: 'https://spam.example' })).toBe('honeypot');
  });

  it('flags a non-string honeypot value', () => {
    expect(detectBot({ ...human, [CONTACT_HONEYPOT_FIELD]: 1 })).toBe('honeypot');
  });

  it('flags a submission faster than the minimum', () => {
    expect(detectBot({ ...human, [CONTACT_ELAPSED_FIELD]: MIN_SUBMIT_ELAPSED_MS - 1 })).toBe('too-fast');
  });

  it('accepts a submission right at the minimum', () => {
    expect(detectBot({ ...human, [CONTACT_ELAPSED_FIELD]: MIN_SUBMIT_ELAPSED_MS })).toBeNull();
  });

  it('flags a missing or non-numeric timing field', () => {
    expect(detectBot({ [CONTACT_HONEYPOT_FIELD]: '' })).toBe('missing-timing');
    expect(detectBot({ ...human, [CONTACT_ELAPSED_FIELD]: '15000' })).toBe('missing-timing');
    expect(detectBot({ ...human, [CONTACT_ELAPSED_FIELD]: Number.NaN })).toBe('missing-timing');
  });
});
