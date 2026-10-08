import { z } from 'zod';
import { withRoute, ok } from '@/server/http/handler';
import { lookupForForm } from '@/server/lookup/form';
import { toResponse } from '@/server/records/toResponse';

const schema = z.object({ identifier: z.string().trim().min(1).max(200) });

/** Fetches a record's facts from its register so the form can fill itself. */
export const POST = withRoute(
  { schema, rate: { limit: 30, windowSeconds: 60 } },
  async ({ actor, params, body }) => {
    try { return ok(await lookupForForm(actor, params.moduleKey!, body.identifier)); }
    catch (e) { return toResponse(e); }
  },
);
