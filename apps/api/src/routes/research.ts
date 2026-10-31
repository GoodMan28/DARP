import { z } from 'zod';
import { withRoute, ok, fail } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { parseRange } from '@/server/records/range';
import { audit } from '@/server/audit/log';
import {
  researchProfile, saveResearchIds, saveWos, saveScopus, refreshNow, researchQuality, getThresholds, setThresholds,
} from '@/server/researchers/service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/profile/research?userId=&from=&to= — research IDs, figures and signal (own, or as HOD/DRIE/IQAC). */
export const GET = withRoute({ rate: { limit: 60, windowSeconds: 60 } }, async ({ actor, query }) => {
  const userId = query.get('userId') ?? actor.id;
  if (!UUID.test(userId)) return fail('NOT_FOUND');
  try { return ok(await researchProfile(actor, userId, parseRange(query.get('from'), query.get('to')) ?? undefined)); }
  catch (e) { return toResponse(e); }
});

const idsSchema = z.object({
  scopusAuthorId: z.string().trim().max(60).nullable().optional(),
  researcherId: z.string().trim().max(80).nullable().optional(),
});

/** PUT /api/profile/research/ids — the person's own Scopus Author ID and ResearcherID. */
export const PUT_IDS = withRoute(
  { schema: idsSchema, rate: { limit: 10, windowSeconds: 300 } },
  async ({ actor, body, ip, userAgent }) => {
    try {
      const after = await saveResearchIds(actor, body);
      await audit({
        actor, action: 'research.ids', entity: 'user', entityId: actor.id, ip, userAgent,
        after: { scopusAuthorId: after.scopusAuthorId, researcherId: after.researcherId, scopusNameMatches: after.scopusCheck?.nameMatches ?? null },
      });
      return ok(after);
    } catch (e) { return toResponse(e); }
  },
);

const wosSchema = z.object({
  documents: z.number().int().min(0).max(100_000),
  citationsExclSelf: z.number().int().min(0).max(10_000_000),
  hIndex: z.number().int().min(0).max(1000),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  evidenceId: z.string().uuid(),
});

/** POST /api/profile/research/wos — Web of Science figures typed by the person, with a screenshot. */
export const POST_WOS = withRoute(
  { schema: wosSchema, rate: { limit: 20, windowSeconds: 300 } },
  async ({ actor, body, ip, userAgent }) => {
    try {
      const after = await saveWos(actor, body);
      await audit({ actor, action: 'research.wos', entity: 'user', entityId: actor.id, ip, userAgent, after: body });
      return ok(after);
    } catch (e) { return toResponse(e); }
  },
);

const scopusSchema = z.object({
  documents: z.number().int().min(0).max(100_000),
  citations: z.number().int().min(0).max(10_000_000),
  citationsExclSelf: z.number().int().min(0).max(10_000_000).nullable(),
  hIndex: z.number().int().min(0).max(1000),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  evidenceId: z.string().uuid(),
});

/** POST /api/profile/research/scopus — Scopus figures typed by the person, with a screenshot. */
export const POST_SCOPUS = withRoute(
  { schema: scopusSchema, rate: { limit: 20, windowSeconds: 300 } },
  async ({ actor, body, ip, userAgent }) => {
    try {
      const after = await saveScopus(actor, body);
      await audit({ actor, action: 'research.scopus', entity: 'user', entityId: actor.id, ip, userAgent, after: body });
      return ok(after);
    } catch (e) { return toResponse(e); }
  },
);

const refreshSchema = z.object({ userId: z.string().uuid().optional() });

/** POST /api/profile/research/refresh — fetch Scopus figures now (own; IQAC anyone's). */
export const POST_REFRESH = withRoute(
  { schema: refreshSchema, rate: { limit: 10, windowSeconds: 300 } },
  async ({ actor, body, ip, userAgent }) => {
    try {
      const userId = body.userId ?? actor.id;
      const after = await refreshNow(actor, userId);
      await audit({ actor, action: 'research.refresh', entity: 'user', entityId: userId, ip, userAgent });
      return ok(after);
    } catch (e) { return toResponse(e); }
  },
);

/** GET /api/reports/research-quality?from=&to=&departments= — IQAC's table (DRIE too; a HOD their department). */
export const QUALITY = withRoute({ rate: { limit: 30, windowSeconds: 60 } }, async ({ actor, query }) => {
  const depts = (query.get('departments') ?? '').split(',').filter((d) => UUID.test(d));
  try { return ok(await researchQuality(actor, parseRange(query.get('from'), query.get('to')), depts.length ? depts : null)); }
  catch (e) { return toResponse(e); }
});

/** GET /api/admin/research/thresholds */
export const GET_THRESHOLDS = withRoute({ rate: { limit: 60, windowSeconds: 60 } }, async () => ok(await getThresholds()));

const thresholdsSchema = z.object({
  qualityWosShare: z.number().optional(), qualityTopShare: z.number().optional(),
  volumeDocuments: z.number().optional(), volumeTopShare: z.number().optional(),
  volumeCitationsPerPaper: z.number().optional(), minDocuments: z.number().optional(),
});

/** PUT /api/admin/research/thresholds — IQAC changes the research-quality thresholds. */
export const PUT_THRESHOLDS = withRoute(
  { schema: thresholdsSchema, capability: 'manageLists', rate: { limit: 20, windowSeconds: 300 } },
  async ({ actor, body, ip, userAgent }) => {
    try {
      const after = await setThresholds(actor, body);
      await audit({ actor, action: 'settings.update', entity: 'setting', entityId: 'researchQualityThresholds', ip, userAgent, after });
      return ok(after);
    } catch (e) { return toResponse(e); }
  },
);
