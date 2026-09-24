import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { users, passwordResets } from '@/server/db/schema';
import { withRoute, ok } from '@/server/http/handler';
import { RESET_TOKEN_TTL_MINUTES } from '@/server/auth/constants';
import { audit } from '@/server/audit/log';
import { log } from '@/server/log';

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

export const POST = withRoute(
  { auth: false, schema, rate: { limit: 5, windowSeconds: 900 } },
  async ({ body, ip }) => {
    const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${body.email}`).limit(1);

    if (user?.isActive) {
      const token = randomBytes(32).toString('base64url');
      await db.insert(passwordResets).values({
        tokenHash: createHash('sha256').update(token).digest('hex'),
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000),
      });
      // In development the link is logged, never returned in the response.
      log.info('password reset issued', { userId: user.id, link: `/reset?token=${token}` });
      await audit({ action: 'auth.password.reset.request', entity: 'user', entityId: user.id, ip });
    }

    // Identical response whether or not the account exists.
    return ok({ sent: true });
  },
);
