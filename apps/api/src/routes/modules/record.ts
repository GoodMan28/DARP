import { z } from 'zod';
import { withRoute, ok } from '@/server/http/handler';
import { getRecord, updateRecord, deleteRecord } from '@/server/records/service';
import { toResponse } from '@/server/records/toResponse';

const patchSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  mode: z.enum(['draft', 'submit']).default('draft'),
});

export const GET = withRoute({ rate: { limit: 120, windowSeconds: 60 } }, async ({ actor, params }) => {
  try { return ok(await getRecord(actor, params.moduleKey!, params.id!)); }
  catch (e) { return toResponse(e); }
});

export const PATCH = withRoute(
  { schema: patchSchema, rate: { limit: 60, windowSeconds: 60 } },
  async ({ actor, params, body }) => {
    try { return ok(await updateRecord(actor, params.moduleKey!, params.id!, body.values, body.mode)); }
    catch (e) { return toResponse(e); }
  },
);

export const DELETE = withRoute({ rate: { limit: 30, windowSeconds: 60 } }, async ({ actor, params }) => {
  try { return ok(await deleteRecord(actor, params.moduleKey!, params.id!)); }
  catch (e) { return toResponse(e); }
});
