import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { CSRF_COOKIE, CSRF_HEADER, appOrigin, isProd } from './constants';
import { safeEqual } from '@/server/crypto/pii';

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
export async function setCsrfCookie(sessionId: string) {
  const store = await cookies();
  store.set(CSRF_COOKIE, makeCsrfToken(sessionId), {
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
export async function assertSameOrigin(method: string): Promise<boolean> {
  if (!UNSAFE.has(method.toUpperCase())) return true;

  const h = await headers();
  const origin = h.get('origin');
  const referer = h.get('referer');
  const expected = appOrigin();

  if (origin) return origin === expected;
  if (referer) {
    try { return new URL(referer).origin === expected; } catch { return false; }
  }
  return false;                // no Origin and no Referer on an unsafe method: refuse
}

/** Two independent checks: same-origin, and a session-bound token. Both must pass. */
export async function assertCsrf(method: string, sessionId: string): Promise<boolean> {
  if (!UNSAFE.has(method.toUpperCase())) return true;
  if (!(await assertSameOrigin(method))) return false;

  const store = await cookies();
  const h = await headers();
  const cookieToken = store.get(CSRF_COOKIE)?.value;
  const headerToken = h.get(CSRF_HEADER);
  if (!cookieToken || !headerToken) return false;
  if (!safeEqual(cookieToken, headerToken)) return false;
  return verifyCsrfToken(sessionId, headerToken);
}
