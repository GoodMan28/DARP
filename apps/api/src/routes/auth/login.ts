import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { withRoute, ok, fail } from '@/server/http/handler';
import { verifyPassword, DUMMY_HASH } from '@/server/auth/password';
import { createSession, pruneExpiredSessions, revokeAllSessionsForUser } from '@/server/auth/session';
import { setCsrfCookie } from '@/server/auth/csrf';
import {
  recordLoginAttempt, isIpThrottled, isAccountLocked, registerFailure, clearFailures,
} from '@/server/auth/rateLimit';
import { audit } from '@/server/audit/log';

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const POST = withRoute(
  { auth: false, schema, rate: { limit: 10, windowSeconds: 60 } },
  async ({ body, ip, userAgent, res }) => {
    // Same response for every failure mode: no account enumeration.
    const genericFailure = () => fail('UNAUTHENTICATED', { message: 'E-mail or password is incorrect.' });

    if (await isIpThrottled(ip)) {
      await audit({ action: 'auth.login.fail', entity: 'session', ip, meta: { reason: 'ip throttled' } });
      return fail('RATE_LIMITED', { message: 'Too many failed attempts from this network. Try again later.' });
    }

    const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${body.email}`).limit(1);

    // Always run argon2, even with no user, so the timing is identical.
    const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
    const passwordOk = await verifyPassword(hashToCheck, body.password);

    if (!user || !user.isActive) {
      await recordLoginAttempt(body.email, ip, false);
      await audit({
        action: 'auth.login.fail', entity: 'session', ip, userAgent,
        meta: { email: body.email, reason: 'unknown or inactive' },
      });
      return genericFailure();
    }

    if (await isAccountLocked(user.id)) {
      await recordLoginAttempt(body.email, ip, false);
      await audit({ action: 'auth.locked', entity: 'user', entityId: user.id, ip, userAgent });
      return fail('RATE_LIMITED', { message: 'This account is temporarily locked. Try again in 15 minutes.' });
    }

    if (!passwordOk) {
      await registerFailure(user.id);
      await recordLoginAttempt(body.email, ip, false);
      await audit({ action: 'auth.login.fail', entity: 'user', entityId: user.id, ip, userAgent });
      return genericFailure();
    }

    // Success. Kill any existing sessions (session fixation) and start a fresh one.
    await revokeAllSessionsForUser(user.id);
    const { id: sessionId } = await createSession(res, user.id, { ip, userAgent });
    setCsrfCookie(res, sessionId);
    await clearFailures(user.id);
    await recordLoginAttempt(body.email, ip, true);
    await pruneExpiredSessions();
    await audit({ action: 'auth.login.success', entity: 'user', entityId: user.id, ip, userAgent });

    return ok({
      user: { id: user.id, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword },
      next: user.mustChangePassword ? '/change-password' : '/dashboard',
    });
  },
);
