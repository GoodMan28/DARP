import { z } from 'zod';
import { withRoute, ok, fail } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { counterValuesFor, setBaseline } from '@/server/rollups/completion';
import { parseRange } from '@/server/records/range';
import { audit } from '@/server/audit/log';
import { declaredSheet, saveDeclared } from '@/server/rollups/declared';

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

const yearParam = (v: string | null) => (v && /^(19|20)\d{2}$/.test(v) ? Number(v) : undefined);

/**
 * The declared figures for one academic and one calendar year: GET /api/profile/declared?ay=2024&cy=2024
 * (the last finished year of each when left out). `counted=1` adds what DARP counts from the person's records.
 */
export const DECLARED_GET = withRoute({ rate: { limit: 60, windowSeconds: 60 } }, async ({ actor, query }) => {
  try {
    return ok(await declaredSheet(actor, {
      ay: yearParam(query.get('ay')), cy: yearParam(query.get('cy')), counted: query.get('counted') === '1',
    }));
  } catch (e) { return toResponse(e); }
});

const declaredSchema = z.object({
  values: z.array(z.object({
    counterKey: z.string().min(3).max(120),
    value: z.number().int().min(0).max(1_000_000_000_000).nullable(),
  })).min(1).max(13),
});

/** Saves the declared figures that were changed, together; one audit row for each. */
export const DECLARED_PUT = withRoute(
  { schema: declaredSchema, rate: { limit: 30, windowSeconds: 60 } },
  async ({ actor, body, ip, userAgent }) => {
    try {
      const changes = await saveDeclared(actor, body.values);
      for (const c of changes) {
        await audit({
          actor, action: 'baseline.update', entity: 'baseline', entityId: `${actor.id}:${c.key}`, ip, userAgent,
          before: { counterKey: c.key, value: c.before }, after: { counterKey: c.key, value: c.after }, meta: { targetUserId: actor.id },
        });
      }
      return ok({ changed: changes.length });
    } catch (e) { return toResponse(e); }
  },
);
