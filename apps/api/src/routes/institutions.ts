import { z } from 'zod';
import { withRoute, ok } from '@/server/http/handler';
import { searchInstitutes } from '@/server/institutions/service';
import { proposeInstitute } from '@/server/institutions/propose';
import { toResponse } from '@/server/records/toResponse';
import { getList } from '@/server/records/masterLists';
import { NOT_A_COUNTRY } from '@darp/shared/institutions';
import { audit } from '@/server/audit/log';

/**
 * Institutes matching what was typed, for the picker on forms:
 * GET /api/institutions/search?q=bit%20mesra&excludeHome=1
 */
export const SEARCH = withRoute({ rate: { limit: 120, windowSeconds: 60 } }, async ({ query }) => {
  const q = (query.get('q') ?? '').slice(0, 120);
  return ok(await searchInstitutes(q, { excludeHome: query.get('excludeHome') === '1' }));
});

/** GET /api/institutions/countries: the countries an added organisation can be in. */
export const COUNTRIES = withRoute({ rate: { limit: 60, windowSeconds: 60 } }, async () => {
  return ok((await getList('countries')).filter((c) => !NOT_A_COUNTRY.includes(c)));
});

const addSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.string().trim().max(60),
  country: z.string().trim().max(120),
  city: z.string().trim().max(120).nullish(),
  state: z.string().trim().max(120).nullish(),
  website: z.string().trim().max(300).nullish(),
});

/**
 * POST /api/institutions: an organisation the directory lacks. Usable at once; IQAC reviews it afterwards
 * (an IQAC administrator's own additions are approved already).
 */
export const ADD = withRoute({ schema: addSchema, rate: { limit: 30, windowSeconds: 3600 } }, async ({ actor, body, ip, userAgent }) => {
  try {
    const hit = await proposeInstitute(actor, body);
    await audit({ actor, action: 'institution.propose', entity: 'institution', entityId: hit.code, ip, userAgent, after: { ...hit, kind: body.kind } });
    return ok(hit);
  } catch (e) { return toResponse(e); }
});
