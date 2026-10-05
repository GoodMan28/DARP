/**
 * In production the session cookie carries the `__Host-` prefix, so the browser refuses it
 * unless it is Secure, has Path=/ and no Domain. DARP lives on a subdomain of the college
 * domain, and without the prefix any sibling `*.bitmesra.ac.in` site could plant its own
 * `darp_session` cookie (session fixation by cookie tossing). Plain HTTP on localhost
 * cannot hold a Secure cookie, so development keeps the bare name. The web tier's
 * middleware accepts either name.
 */
export const SESSION_COOKIE = isProd() ? '__Host-darp_session' : 'darp_session';
export const CSRF_COOKIE = 'darp_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;          // bound the work argon2 must do

export const LOGIN_MAX_FAILURES = 5;             // per account
export const LOGIN_WINDOW_MINUTES = 15;
export const LOCKOUT_MINUTES = 15;
export const LOGIN_MAX_FAILURES_PER_IP = 20;     // per IP, same window

export const SESSION_IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES ?? 30);
export const SESSION_ABSOLUTE_MINUTES = Number(process.env.SESSION_ABSOLUTE_MINUTES ?? 480);

export const RESET_TOKEN_TTL_MINUTES = 30;

export function appOrigin(): string {
  const url = process.env.APP_URL;
  if (!url) throw new Error('APP_URL is not set — CSRF origin checks require it');
  return new URL(url).origin;
}

export function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}
