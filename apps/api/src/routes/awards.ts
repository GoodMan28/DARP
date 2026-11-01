import { z } from 'zod';
import { withRoute, ok } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { similarAwards } from '@/server/records/similarAwards';

const idOrNothing = z.string().uuid().optional().catch(undefined);

/**
 * The same award in another of the four award modules: GET /api/awards/similar?name=&date=&exclude=
 * Only the caller's own entries are read. A warning for the form, never a block.
 */
export const SIMILAR = withRoute({ rate: { limit: 120, windowSeconds: 60 } }, async ({ actor, query }) => {
  try {
    return ok(await similarAwards(actor, {
      name: (query.get('name') ?? '').slice(0, 300),
      date: (query.get('date') ?? '').slice(0, 10),
      excludeId: idOrNothing.parse(query.get('exclude') ?? undefined),
    }));
  } catch (e) { return toResponse(e); }
});
