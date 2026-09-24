import { withRoute, ok, fail } from '@/server/http/handler';
import {
  mustGetModule, activeCycle, statusCounts, getNilDeclaration,
} from '@/server/records/service';
import { toResponse } from '@/server/records/toResponse';
import { canViewModule, canCreateIn, canVerify } from '@/server/auth/permissions';
import { getAllLists } from '@/server/records/masterLists';
import { periodOptions } from '@/server/records/periods';

/** The browser renders the form from this. It contains no data, only the shape. */
export const GET = withRoute({ rate: { limit: 120, windowSeconds: 60 } }, async ({ actor, params }) => {
  try {
    const m = mustGetModule(params.moduleKey!);
    if (!canViewModule(actor, m)) return fail('FORBIDDEN');

    const lists = await getAllLists();
    const cycle = await activeCycle();

    return ok({
      key: m.key,
      name: m.name,
      group: m.group,
      description: m.description,
      periodType: m.periodType,
      naacRef: m.naacRef ?? null,
      bodies: m.bodies,
      scope: m.scope,
      canCreate: canCreateIn(actor, m),
      canVerify: canVerify(actor, m),
      listColumns: m.listColumns,
      periods: periodOptions(m, cycle),
      counts: await statusCounts(actor, m.key),
      declaredNil: await getNilDeclaration(actor, m.key),
      fields: m.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: !!f.required,
        help: f.help ?? null,
        placeholder: f.placeholder ?? null,
        options: f.listKey ? (lists[f.listKey] ?? []) : (f.options ?? []),
        showIf: f.showIf ?? null,
        section: f.section ?? null,
        colSpan: f.colSpan ?? 1,
        maxLength: f.maxLength ?? null,
        accept: f.accept ?? null,
        maxSizeMB: f.maxSizeMB ?? null,
        // The browser is told a field is protected, but never why or how.
        protected: f.pii === 'encrypted' || !!f.sensitive,
      })),
    });
  } catch (e) {
    return toResponse(e);
  }
});
