import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { withRoute, ok, fail } from '@/server/http/handler';
import {
  hashPassword, verifyPassword, assertPasswordAcceptable, PasswordPolicyError,
} from '@/server/auth/password';
import { revokeAllSessionsForUser, createSession } from '@/server/auth/session';
import { setCsrfCookie } from '@/server/auth/csrf';
import { audit } from '@/server/audit/log';

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});

export const POST = withRoute(
  { schema, allowPendingPasswordChange: true, rate: { limit: 5, windowSeconds: 300 } },
  async ({ actor, body, ip, userAgent, res }) => {
    const [user] = await db.select().from(users).where(eq(users.id, actor.id));
    if (!user) return fail('UNAUTHENTICATED');

    if (!(await verifyPassword(user.passwordHash, body.currentPassword))) {
      await audit({
        actor, action: 'auth.password.change', entity: 'user', entityId: actor.id, ip,
        meta: { result: 'wrong current password' },
      });
      return fail('VALIDATION', { fields: { currentPassword: 'That is not your current password.' } });
    }
    if (body.currentPassword === body.newPassword) {
      return fail('VALIDATION', {
        fields: { newPassword: 'Choose a password you have not used here before.' },
      });
    }
    try {
      assertPasswordAcceptable(body.newPassword, { email: user.email, name: user.name });
    } catch (e) {
      if (e instanceof PasswordPolicyError) return fail('VALIDATION', { fields: { newPassword: e.message } });
      throw e;
    }

    await db.update(users)
      .set({
        passwordHash: await hashPassword(body.newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      })
      .where(eq(users.id, actor.id));

    // Every other device is signed out; this one gets a fresh session.
    await revokeAllSessionsForUser(actor.id);
    const { id: sessionId } = await createSession(res, actor.id, { ip, userAgent });
    setCsrfCookie(res, sessionId);

    await audit({
      actor, action: 'auth.password.change', entity: 'user', entityId: actor.id, ip, userAgent,
      meta: { result: 'ok' },
    });
    return ok({ changed: true });
  },
);
