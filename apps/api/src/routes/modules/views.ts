import { z } from 'zod';
import { withRoute, ok, fail } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { listSavedViews, createSavedView, deleteSavedView } from '@/server/records/savedViews';
import { audit } from '@/server/audit/log';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/modules/:moduleKey/views — the caller's saved views and those IQAC shared. */
export const GET = withRoute({ rate: { limit: 60, windowSeconds: 60 } }, async ({ actor, params }) => {
  try { return ok(await listSavedViews(actor, params.moduleKey!)); } catch (e) { return toResponse(e); }
});

const schema = z.object({ name: z.string().max(200), view: z.unknown(), shared: z.boolean().default(false) });

/** POST /api/modules/:moduleKey/views — saves the view the caller has open. */
export const POST = withRoute(
  { schema, rate: { limit: 20, windowSeconds: 300 } },
  async ({ actor, params, body, ip }) => {
    try {
      const saved = await createSavedView(actor, params.moduleKey!, body);
      if (saved.shared) {
        await audit({ actor, action: 'settings.update', entity: 'setting', entityId: `view:${params.moduleKey}`, ip, after: { name: saved.name, shared: true } });
      }
      return ok(saved);
    } catch (e) { return toResponse(e); }
  },
);

/** DELETE /api/modules/:moduleKey/views/:id */
export const DELETE = withRoute({ rate: { limit: 30, windowSeconds: 300 } }, async ({ actor, params }) => {
  if (!UUID.test(params.id ?? '')) return fail('NOT_FOUND');
  try { await deleteSavedView(actor, params.moduleKey!, params.id!); return ok({ deleted: true }); } catch (e) { return toResponse(e); }
});
