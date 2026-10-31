import { z } from 'zod';
import { withRoute, ok, fail } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { counterValuesFor, setBaseline } from '@/server/rollups/completion';
import { parseRange } from '@/server/records/range';
import { audit } from '@/server/audit/log';

export const GET = withRoute({ rate: { limit: 60, windowSeconds: 60 } }, async ({ actor, query }) => {
  try {
    const asUser = query.get('userId');
    // Viewing someone else's numbers is an admin action; the service enforces it too.
    if (asUser && asUser !== actor.id && actor.role !== 'admin') return fail('FORBIDDEN');
    // ?from=2022&to=2024 counts the records of those years; without it, the default range.
    const hasRange = query.get('from') !== null || query.get('to') !== null;
    const range = parseRange(query.get('from'), query.get('to'));
    if (hasRange && !range) return fail('VALIDATION', { message: 'Choose years between 1990 and 2100, first year before the last.' });
    return ok(await counterValuesFor(actor, asUser ?? actor.id, range ?? undefined));
  } catch (e) {
    return toResponse(e);
  }
});

const patchSchema = z.object({
  userId: z.string().uuid().optional(),
  counterKey: z.string().min(3).max(120),
  value: z.number().int().min(0).max(1_000_000_000_000),
});

/** Sets a "since joining BIT" baseline or a declared figure. Always audited. */
export const PATCH = withRoute(
  { schema: patchSchema, rate: { limit: 60, windowSeconds: 60 } },
  async ({ actor, body, ip, userAgent }) => {
    try {
      const result = await setBaseline(actor, body.userId ?? actor.id, body.counterKey, body.value);
      await audit({
        actor,
        action: 'baseline.update',
        entity: 'baseline',
        entityId: `${result.userId}:${result.counterKey}`,
        ip,
        userAgent,
        after: { counterKey: result.counterKey, value: result.value },
        meta: { targetUserId: result.userId },
      });
      return ok(result);
    } catch (e) {
      return toResponse(e);
    }
  },
);
