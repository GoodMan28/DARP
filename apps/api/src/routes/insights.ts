import { withRoute, ok, fail } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { parseRange, type YearRange } from '@/server/records/range';
import { personInsights, departmentInsights, collegeInsights } from '@/server/rollups/insights';

/*
 * The figures behind the Overview, department and college pages. Who may see what is decided in the
 * service (canSeePerson, canSeeDepartment, canSeeCollege), not here. ?from=2022&to=2024 limits the
 * figures to those years; without it they cover every year.
 */

type Query = { get(name: string): string | null };

/** The chosen years, null for all of them, or the message to send back when they make no sense. */
function rangeOf(query: Query): { range: YearRange | null } | { error: string } {
  if (query.get('from') === null && query.get('to') === null) return { range: null };
  const range = parseRange(query.get('from'), query.get('to'));
  return range ? { range } : { error: 'Choose years between 1990 and 2100, first year before the last.' };
}

const LIMIT = { rate: { limit: 60, windowSeconds: 60 } };

/** GET /api/insights/me: the signed-in person's own page, with their to-do list. */
export const ME = withRoute(LIMIT, async ({ actor, query }) => {
  try {
    const r = rangeOf(query);
    if ('error' in r) return fail('VALIDATION', { message: r.error });
    return ok(await personInsights(actor, actor.id, r.range));
  } catch (e) { return toResponse(e); }
});

/** GET /api/insights/person/:userId */
export const PERSON = withRoute(LIMIT, async ({ actor, params, query }) => {
  try {
    const r = rangeOf(query);
    if ('error' in r) return fail('VALIDATION', { message: r.error });
    return ok(await personInsights(actor, params.userId!, r.range));
  } catch (e) { return toResponse(e); }
});

/** GET /api/insights/department/:code */
export const DEPARTMENT = withRoute(LIMIT, async ({ actor, params, query }) => {
  try {
    const r = rangeOf(query);
    if ('error' in r) return fail('VALIDATION', { message: r.error });
    return ok(await departmentInsights(actor, params.code!, r.range));
  } catch (e) { return toResponse(e); }
});

/** GET /api/insights/college */
export const COLLEGE = withRoute(LIMIT, async ({ actor, query }) => {
  try {
    const r = rangeOf(query);
    if ('error' in r) return fail('VALIDATION', { message: r.error });
    return ok(await collegeInsights(actor, r.range));
  } catch (e) { return toResponse(e); }
});
