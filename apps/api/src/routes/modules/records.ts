import { z } from 'zod';
import { withRoute, ok, fail } from '@/server/http/handler';
import { listRecords, createRecord, mustGetModule } from '@/server/records/service';
import { toResponse } from '@/server/records/toResponse';
import { canViewModule } from '@/server/auth/permissions';
import type { RecordStatus } from '@darp/shared/modules/types';

const STATUSES = new Set<RecordStatus>(['draft', 'submitted', 'verified', 'approved', 'returned']);

export const GET = withRoute({ rate: { limit: 120, windowSeconds: 60 } }, async ({ actor, params, query: sp }) => {
  try {
    const m = mustGetModule(params.moduleKey!);
    if (!canViewModule(actor, m)) return fail('FORBIDDEN');

    const statusParam = sp.get('status');
    const yearParam = Number(sp.get('year') ?? '');

    return ok(await listRecords(actor, m.key, {
      q: sp.get('q') ?? undefined,
      sort: sp.get('sort') ?? undefined,
      dir: sp.get('dir') === 'desc' ? 'desc' : 'asc',
      page: Number(sp.get('page') ?? 1) || 1,
      pageSize: Number(sp.get('pageSize') ?? 20) || 20,
      status: statusParam && STATUSES.has(statusParam as RecordStatus)
        ? (statusParam as RecordStatus)
        : undefined,
      periodYear: Number.isInteger(yearParam) && yearParam > 1950 ? yearParam : undefined,
      check: sp.get('check') === '1',
    }));
  } catch (e) {
    return toResponse(e);
  }
});

const createSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  mode: z.enum(['draft', 'submit']).default('draft'),
});

export const POST = withRoute(
  { schema: createSchema, rate: { limit: 60, windowSeconds: 60 } },
  async ({ actor, params, body }) => {
    try {
      return ok(await createRecord(actor, params.moduleKey!, body.values, body.mode));
    } catch (e) {
      return toResponse(e);
    }
  },
);
