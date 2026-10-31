import { z } from 'zod';
import { withRoute, ok } from '@/server/http/handler';
import { listDeletedRecords, restoreRecord } from '@/server/records/service';
import { toResponse } from '@/server/records/toResponse';

/** IQAC only: the records that were deleted, with who removed them and why; and bringing one back. */
export const GET = withRoute(
  { roles: ['admin'], rate: { limit: 60, windowSeconds: 60 } },
  async ({ actor }) => {
    try { return ok(await listDeletedRecords(actor)); }
    catch (e) { return toResponse(e); }
  },
);

export const POST = withRoute(
  { roles: ['admin'], schema: z.object({ id: z.string().uuid() }), rate: { limit: 30, windowSeconds: 60 } },
  async ({ actor, body }) => {
    try { return ok(await restoreRecord(actor, body.id)); }
    catch (e) { return toResponse(e); }
  },
);
