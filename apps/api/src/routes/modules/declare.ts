import { z } from 'zod';
import { withRoute, ok } from '@/server/http/handler';
import { setNilDeclaration } from '@/server/records/service';
import { toResponse } from '@/server/records/toResponse';

const schema = z.object({ declaredNil: z.boolean() });

/** "Nothing to report this cycle" — what makes an empty module count as complete. */
export const POST = withRoute(
  { schema, rate: { limit: 30, windowSeconds: 60 } },
  async ({ actor, params, body }) => {
    try { return ok(await setNilDeclaration(actor, params.moduleKey!, body.declaredNil)); }
    catch (e) { return toResponse(e); }
  },
);
