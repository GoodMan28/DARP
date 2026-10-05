import { randomBytes, createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { and, eq, isNull, lt, or, gt } from 'drizzle-orm';
import { db } from '@/server/db';
import { readCookie } from '@/server/http/cookies';
import { sessions, users, departments } from '@/server/db/schema';
import {
  SESSION_COOKIE, SESSION_IDLE_MINUTES, SESSION_ABSOLUTE_MINUTES, isProd,
} from './constants';
import type { Role } from '@darp/shared/modules/types';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  dateOfJoining: string | null;
  mustChangePassword: boolean;
  sessionId: string;       // the hashed id, safe to log
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function minutesFromNow(m: number): Date {
  return new Date(Date.now() + m * 60_000);
}

/** Creates a session and sets the cookie. Call ONLY after a successful password check. */
export async function createSession(res: Response, userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString('base64url');   // 256 bits of entropy
  const id = hashToken(token);

  await db.insert(sessions).values({
    id,
    userId,
    idleExpiresAt: minutesFromNow(SESSION_IDLE_MINUTES),
    absoluteExpiresAt: minutesFromNow(SESSION_ABSOLUTE_MINUTES),
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',          // 'lax' keeps normal navigation working; CSRF token covers the rest
    path: '/',
    maxAge: SESSION_ABSOLUTE_MINUTES * 60_000,   // Express takes milliseconds
  });

  return { token, id };
}

/** Reads and validates the session. Returns null for anything suspicious — never throws. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;

  const id = hashToken(token);
  const now = new Date();

  const rows = await db
    .select({
      sid: sessions.id,
      idleExpiresAt: sessions.idleExpiresAt,
      uid: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      departmentId: users.departmentId,
      departmentName: departments.name,
      departmentCode: departments.code,
      dateOfJoining: users.dateOfJoining,
      mustChangePassword: users.mustChangePassword,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .where(and(
      eq(sessions.id, id),
      isNull(sessions.revokedAt),
      gt(sessions.idleExpiresAt, now),
      gt(sessions.absoluteExpiresAt, now),
    ))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (!row.isActive) {                       // deactivated while signed in
    await revokeSession(id);
    return null;
  }

  // Sliding idle window, written at most once a minute to avoid a write per request.
  const remaining = row.idleExpiresAt.getTime() - now.getTime();
  if (remaining < (SESSION_IDLE_MINUTES - 1) * 60_000) {
    await db.update(sessions)
      .set({ idleExpiresAt: minutesFromNow(SESSION_IDLE_MINUTES), lastSeenAt: now })
      .where(eq(sessions.id, id));
  }

  return {
    id: row.uid,
    email: row.email,
    name: row.name,
    role: row.role,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    departmentCode: row.departmentCode,
    dateOfJoining: row.dateOfJoining,
    mustChangePassword: row.mustChangePassword,
    sessionId: id,
  };
}

export async function revokeSession(sessionId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Used on password change and on admin deactivation — kills every device. */
export async function revokeAllSessionsForUser(userId: string) {
  await db.update(sessions).set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: isProd(), sameSite: 'lax', path: '/' });
}

/** Housekeeping: delete sessions that expired more than a day ago. Call from the login route. */
export async function pruneExpiredSessions() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
  await db.delete(sessions)
    .where(or(lt(sessions.absoluteExpiresAt, cutoff), lt(sessions.idleExpiresAt, cutoff)));
}
