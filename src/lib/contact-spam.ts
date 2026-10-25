/**
 * Bot checks for the contact form that need no captcha or third-party service.
 *
 * A form posting to /api/contact must include:
 * - CONTACT_HONEYPOT_FIELD: an input humans never see or fill, rendered
 *   visually hidden with aria-hidden="true", tabIndex={-1} and
 *   autoComplete="off". Send it as "" for a real submission.
 * - CONTACT_ELAPSED_FIELD: milliseconds between the form rendering and the
 *   submit click, measured on the client (Date.now() at submit minus
 *   Date.now() at mount). Elapsed time rather than a render timestamp, so a
 *   visitor whose clock is off isn't mistaken for a bot.
 *
 * A request that trips either check gets the normal success response with
 * nothing sent, so a bot has no signal to adapt to.
 */

export const CONTACT_HONEYPOT_FIELD = 'website';
export const CONTACT_ELAPSED_FIELD = 'formElapsedMs';

/** Humans take longer than this to fill in the form */
export const MIN_SUBMIT_ELAPSED_MS = 3000;

export type BotReason = 'honeypot' | 'too-fast' | 'missing-timing';

export function detectBot(body: Record<string, unknown>): BotReason | null {
  const honeypot = body[CONTACT_HONEYPOT_FIELD];
  if (typeof honeypot === 'string' ? honeypot.trim() !== '' : honeypot != null) {
    return 'honeypot';
  }

  const elapsed = body[CONTACT_ELAPSED_FIELD];
  if (typeof elapsed !== 'number' || !Number.isFinite(elapsed)) {
    return 'missing-timing';
  }
  if (elapsed < MIN_SUBMIT_ELAPSED_MS) {
    return 'too-fast';
  }

  return null;
}
