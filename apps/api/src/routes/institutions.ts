import { withRoute, ok } from '@/server/http/handler';
import { searchInstitutes } from '@/server/institutions/service';

/**
 * Institutes matching what was typed, for the picker on forms:
 * GET /api/institutions/search?q=bit%20mesra&excludeHome=1
 */
export const SEARCH = withRoute({ rate: { limit: 120, windowSeconds: 60 } }, async ({ query }) => {
  const q = (query.get('q') ?? '').slice(0, 120);
  return ok(await searchInstitutes(q, { excludeHome: query.get('excludeHome') === '1' }));
});
