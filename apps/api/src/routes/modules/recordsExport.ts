import { withRoute, fail, file } from '@/server/http/handler';
import { exportRows, mustGetModule } from '@/server/records/service';
import { toCsv, toXlsx } from '@/server/records/viewExport';
import { toResponse } from '@/server/records/toResponse';
import { canViewModule } from '@/server/auth/permissions';
import { audit } from '@/server/audit/log';
import { describeView, EXPORT_LIMIT } from '@darp/shared/views';
import type { RecordStatus } from '@darp/shared/modules/types';
import { parseViewParam } from './records';

const STATUSES = new Set<RecordStatus>(['draft', 'submitted', 'verified', 'approved', 'returned']);

/**
 * GET /api/modules/:moduleKey/records/export?format=xlsx|csv&view=…&q=&status=&year=&check=
 * The rows the module page shows for that view, all pages, up to 10,000, within the caller's own scope.
 */
export const GET = withRoute(
  { rate: { limit: 10, windowSeconds: 300 } },
  async ({ actor, params, query: sp, ip }) => {
    try {
      const m = mustGetModule(params.moduleKey!);
      if (!canViewModule(actor, m)) return fail('FORBIDDEN');
      const format = sp.get('format') === 'csv' ? 'csv' : 'xlsx';
      const status = sp.get('status') as RecordStatus | null;
      const year = Number(sp.get('year') ?? '');
      const data = await exportRows(actor, m.key, {
        q: sp.get('q') ?? undefined,
        status: status && STATUSES.has(status) ? status : undefined,
        periodYear: Number.isInteger(year) && year > 1950 ? year : undefined,
        check: sp.get('check') === '1',
        view: parseViewParam(sp.get('view')),
      }, EXPORT_LIMIT);

      const now = new Date();
      const bytes = format === 'csv' ? toCsv(m, data) : await toXlsx(m, data, actor.name, now);
      await audit({
        actor, action: 'export.generate', entity: 'export', entityId: m.key, ip,
        meta: { module: m.key, format, rows: data.rows.length, truncated: data.truncated, filter: describeView(data.view, data.columns) },
      });
      const stamp = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      return file(bytes, {
        'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="DARP-${m.key}-${stamp}.${format}"`,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      });
    } catch (e) {
      return toResponse(e);
    }
  },
);
