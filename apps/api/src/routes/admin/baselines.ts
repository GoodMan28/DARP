import { z } from 'zod';
import { withRoute, ok, fail } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { counterValuesFor, setBaseline } from '@/server/rollups/completion';
import { audit } from '@/server/audit/log';

/**
 * The manually-entered "since joining BIT" figures and declared counters, for any
 * account. Faculty edit their own through `/api/profile/rollups`; this route is the
 * IQAC view of somebody else's, so it is admin-only.
 */
export const GET = withRoute(
  { roles: ['admin'], capability: 'manageUsers', rate: { limit: 60, windowSeconds: 60 } },
  async ({ actor, query }) => {
    const userId = query.get('userId');
    const check = z.string().uuid().safeParse(userId);
    if (!check.success) {
      return fail('VALIDATION', { fields: { userId: 'Choose an account.' } });
    }
    try {
      return ok(await counterValuesFor(actor, check.data));
    } catch (e) {
      return toResponse(e);
    }
  },
);

const patchSchema = z.object({
  userId: z.string().uuid(),
  counterKey: z.string().trim().min(3).max(120),
  value: z.number().int().min(0).max(1_000_000_000_000),
});

export const PATCH = withRoute(
  { roles: ['admin'], capability: 'manageUsers', schema: patchSchema, rate: { limit: 60, windowSeconds: 60 } },
  async ({ actor, body, ip, userAgent }) => {
    try {
      // `setBaseline` re-checks the actor and rejects any key that is computed
      // from records, so a cycle figure can never be seeded by hand.
      const before = await counterValuesFor(actor, body.userId);
      const previous = before.declared.find((d) => d.key === body.counterKey)?.value
        ?? before.computed.find((c) => c.key === body.counterKey)?.baseline
        ?? 0;

      const result = await setBaseline(actor, body.userId, body.counterKey, body.value);

      await audit({
        actor,
        action: 'baseline.update',
        entity: 'baseline',
        entityId: `${result.userId}:${result.counterKey}`,
        ip,
        userAgent,
        before: { counterKey: result.counterKey, value: previous },
        after: { counterKey: result.counterKey, value: result.value },
        meta: { targetUserId: result.userId },
      });

      return ok(result);
    } catch (e) {
      return toResponse(e);
    }
  },
);
