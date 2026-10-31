import { withRoute, ok, fail } from '@/server/http/handler';
import { rankingFor } from '@/server/journals/ranking';
import { normIssn } from '@darp/shared/journals';

/**
 * A journal's indexing, quartile and Impact Factor from the latest lists loaded, for the form to
 * show as the owner types or fetches the ISSN: GET /api/journals/ranking?issn=0167-739X&year=2024.
 */
export const GET = withRoute({ rate: { limit: 120, windowSeconds: 60 } }, async ({ query }) => {
  const issns = query.getAll('issn').slice(0, 4).map((s) => normIssn(s)).filter((x): x is string => x !== null);
  if (issns.length === 0) return fail('VALIDATION', { message: 'Give an ISSN, e.g. 0167-739X.' });
  const year = Number(query.get('year') ?? '');
  return ok(await rankingFor(issns, Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null));
});
