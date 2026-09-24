import 'server-only';

export const SESSION_COOKIE = 'darp_session';
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
