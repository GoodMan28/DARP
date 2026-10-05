import { z } from 'zod';
import { createHash } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { users, passwordResets } from '@/server/db/schema';
import { withRoute, ok, fail } from '@/server/http/handler';
import { hashPassword, assertPasswordAcceptable, PasswordPolicyError } from '@/server/auth/password';
import { revokeAllSessionsForUser } from '@/server/auth/session';
import { audit } from '@/server/audit/log';

const schema = z.object({
  token: z.string().min(10).max(200),
  newPassword: z.string().min(1).max(200),
});

export const POST = withRoute(
  { auth: false, schema, rate: { limit: 10, windowSeconds: 900 } },
  async ({ body, ip }) => {
    const tokenHash = createHash('sha256').update(body.token).digest('hex');
    const [row] = await db.select().from(passwordResets)
      .where(and(
        eq(passwordResets.tokenHash, tokenHash),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
      ))
      .limit(1);

    if (!row) return fail('VALIDATION', { message: 'This reset link is invalid or has expired.' });

    const [user] = await db.select().from(users).where(eq(users.id, row.userId));
    if (!user || !user.isActive) {
      return fail('VALIDATION', { message: 'This reset link is invalid or has expired.' });
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
        failedAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, user.id));
    await db.update(passwordResets).set({ usedAt: new Date() })
      .where(eq(passwordResets.tokenHash, tokenHash));
    await revokeAllSessionsForUser(user.id);

    await audit({ action: 'auth.password.reset.complete', entity: 'user', entityId: user.id, ip });
    return ok({ reset: true });
  },
);
