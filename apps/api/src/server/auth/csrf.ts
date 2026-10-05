import { createHmac, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { CSRF_COOKIE, CSRF_HEADER, appOrigin, isProd } from './constants';
import { safeEqual } from '@/server/crypto/pii';
import { readCookie } from '@/server/http/cookies';

function secret(): Buffer {
  const raw = process.env.SESSION_SECRET;
  if (!raw) throw new Error('SESSION_SECRET is not set');
  return Buffer.from(raw, 'base64');
}

/** Token is HMAC(sessionId, SESSION_SECRET) + a random salt, so it is bound to the session. */
export function makeCsrfToken(sessionId: string): string {
  const salt = randomBytes(8).toString('base64url');
  const mac = createHmac('sha256', secret()).update(`${sessionId}.${salt}`).digest('base64url');
  return `${salt}.${mac}`;
}

export function verifyCsrfToken(sessionId: string, token: string | undefined | null): boolean {
  if (!token) return false;
  const [salt, mac] = token.split('.');
  if (!salt || !mac) return false;
  const expected = createHmac('sha256', secret()).update(`${sessionId}.${salt}`).digest('base64url');
  return safeEqual(mac, expected);
}

/** Set after login. Readable by JavaScript on purpose — that is the double-submit pattern. */
export function setCsrfCookie(res: Response, sessionId: string) {
  res.cookie(CSRF_COOKIE, makeCsrfToken(sessionId), {
    httpOnly: false,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
  });
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Same-origin check alone. Applied to EVERY unsafe request, including the ones with no
 * session yet (login, forgot, reset) — otherwise another site could submit the login form
 * on a visitor's behalf and log them into an account the attacker controls.
 */
export interface OriginCheckDetail {
  ok: boolean;
  origin: string | null;
  referer: string | null;
  expected: string;
}

/** Same as assertSameOrigin, but also returns what it saw — for diagnosing a mismatch. */
export function checkSameOrigin(req: Request): OriginCheckDetail {
  const origin = req.get('origin') ?? null;
  const referer = req.get('referer') ?? null;
  const expected = appOrigin();

  if (!UNSAFE.has(req.method.toUpperCase())) return { ok: true, origin, referer, expected };
  if (origin) return { ok: origin === expected, origin, referer, expected };
  if (referer) {
    try { return { ok: new URL(referer).origin === expected, origin, referer, expected }; }
    catch { return { ok: false, origin, referer, expected }; }
  }
  return { ok: false, origin, referer, expected };
}

export function assertSameOrigin(req: Request): boolean {
  return checkSameOrigin(req).ok;
}

/** Two independent checks: same-origin, and a session-bound token. Both must pass. */
export function assertCsrf(req: Request, sessionId: string): boolean {
  if (!UNSAFE.has(req.method.toUpperCase())) return true;
  if (!assertSameOrigin(req)) return false;

  const cookieToken = readCookie(req, CSRF_COOKIE);
  const headerToken = req.get(CSRF_HEADER);
  if (!cookieToken || !headerToken) return false;
  if (!safeEqual(cookieToken, headerToken)) return false;
  return verifyCsrfToken(sessionId, headerToken);
}
