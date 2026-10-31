import { withRoute, ok } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { earlierStudent } from '@/server/records/students';

/**
 * A student the person entered before, for the roll-number box to fill the rest from:
 * GET /api/students/earlier?rollNo=BTECH/1234/22. Only the caller's own entries are read.
 */
export const EARLIER = withRoute({ rate: { limit: 120, windowSeconds: 60 } }, async ({ actor, query }) => {
  try { return ok(await earlierStudent(actor, (query.get('rollNo') ?? '').slice(0, 60))); }
  catch (e) { return toResponse(e); }
});
