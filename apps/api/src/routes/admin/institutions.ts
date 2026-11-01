import { z } from 'zod';
import { withRoute, ok } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { audit } from '@/server/audit/log';
import { approveInstitute, listPending } from '@/server/institutions/review';
import { institutionCount } from '@/server/institutions/service';
import { mergeInstitute } from '@/server/records/institutionMerge';

/** GET /api/admin/institutions: what is waiting for review, and how big the directory is. */
export const GET = withRoute({ roles: ['admin'], capability: 'manageLists', rate: { limit: 60, windowSeconds: 60 } }, async ({ actor }) => {
  try { return ok({ pending: await listPending(actor), total: await institutionCount() }); } catch (e) { return toResponse(e); }
});

const codeSchema = z.object({ code: z.string().trim().min(3).max(40) });

/** POST /api/admin/institutions/approve: an added organisation is fine as it is. */
export const APPROVE = withRoute(
  { roles: ['admin'], capability: 'manageLists', schema: codeSchema, rate: { limit: 60, windowSeconds: 60 } },
  async ({ actor, body, ip, userAgent }) => {
    try {
      const hit = await approveInstitute(actor, body.code);
      await audit({ actor, action: 'institution.approve', entity: 'institution', entityId: hit.code, ip, userAgent, after: hit });
      return ok(hit);
    } catch (e) { return toResponse(e); }
  },
);

const mergeSchema = z.object({ from: z.string().trim().min(3).max(40), into: z.string().trim().min(3).max(40) });

/** POST /api/admin/institutions/merge: every record that names `from` names `into` from now on. */
export const MERGE = withRoute(
  { roles: ['admin'], capability: 'manageLists', schema: mergeSchema, rate: { limit: 30, windowSeconds: 60 } },
  async ({ actor, body, ip, userAgent }) => {
    try {
      const done = await mergeInstitute(actor, body.from, body.into);
      await audit({ actor, action: 'institution.merge', entity: 'institution', entityId: body.from, ip, userAgent, after: { into: body.into, ...done } });
      return ok(done);
    } catch (e) { return toResponse(e); }
  },
);
