import 'server-only';
import { and, count, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { loginAttempts, users } from '@/server/db/schema';
import {
  LOGIN_MAX_FAILURES, LOGIN_MAX_FAILURES_PER_IP, LOGIN_WINDOW_MINUTES, LOCKOUT_MINUTES,
} from './constants';

/* ── generic in-process limiter (per route, per identity) ──────────────
   Single-process deployment (decision #4). If DARP is ever run behind
   more than one Node process, replace this store with a Postgres table or
   Redis — the interface stays the same. */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string, limit: number, windowSeconds: number,
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > limit) return { allowed: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  return { allowed: true, retryAfter: 0 };
}

// Stop the map growing without bound.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}, 60_000).unref?.();

/* ── login-specific, database-backed so it survives a restart ────────── */

export async function recordLoginAttempt(emailLower: string, ip: string, success: boolean) {
  await db.insert(loginAttempts).values({ emailLower, ip, success });
}

export async function isIpThrottled(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60_000);
  const [row] = await db.select({ n: count() }).from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gte(loginAttempts.at, since)));
  return (row?.n ?? 0) >= LOGIN_MAX_FAILURES_PER_IP;
}

export async function isAccountLocked(userId: string): Promise<boolean> {
  const [u] = await db.select({ lockedUntil: users.lockedUntil }).from(users).where(eq(users.id, userId));
  return !!u?.lockedUntil && u.lockedUntil > new Date();
}

export async function registerFailure(userId: string) {
  const [u] = await db.update(users)
    .set({ failedAttempts: sql`${users.failedAttempts} + 1` })
    .where(eq(users.id, userId))
    .returning({ failedAttempts: users.failedAttempts });

  if ((u?.failedAttempts ?? 0) >= LOGIN_MAX_FAILURES) {
    await db.update(users)
      .set({ lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000), failedAttempts: 0 })
      .where(eq(users.id, userId));
  }
}

export async function clearFailures(userId: string) {
  await db.update(users)
    .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, userId));
}
