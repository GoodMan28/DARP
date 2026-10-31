import { z } from 'zod';
import { withRoute, ok } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { identityFor, saveOrcid, clearOrcid } from '@/server/lookup/orcid';
import { audit } from '@/server/audit/log';

/** GET /api/profile/identity: the signed-in person's name in parts and ORCID iD. */
export const GET = withRoute({ rate: { limit: 60, windowSeconds: 60 } }, async ({ actor }) => {
  try { return ok(await identityFor(actor.id)); } catch (e) { return toResponse(e); }
});

const orcidSchema = z.object({ orcid: z.string().trim().min(1).max(60) });

/** POST /api/profile/orcid: saves the person's own ORCID iD after checking it with ORCID. */
export const POST_ORCID = withRoute(
  { schema: orcidSchema, rate: { limit: 10, windowSeconds: 300 } },
  async ({ actor, body, ip, userAgent }) => {
    try {
      const before = await identityFor(actor.id);
      const after = await saveOrcid(actor.id, body.orcid);
      await audit({
        actor, action: 'user.update', entity: 'user', entityId: actor.id, ip, userAgent,
        before: { orcid: before.orcid }, after: { orcid: after.orcid, orcidCheck: after.orcidCheck },
      });
      return ok(after);
    } catch (e) { return toResponse(e); }
  },
);

/** DELETE /api/profile/orcid */
export const DELETE_ORCID = withRoute({ rate: { limit: 10, windowSeconds: 300 } }, async ({ actor, ip, userAgent }) => {
  try {
    const before = await identityFor(actor.id);
    const after = await clearOrcid(actor.id);
    await audit({ actor, action: 'user.update', entity: 'user', entityId: actor.id, ip, userAgent, before: { orcid: before.orcid }, after: { orcid: null } });
    return ok(after);
  } catch (e) { return toResponse(e); }
});
