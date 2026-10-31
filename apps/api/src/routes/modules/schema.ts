import { withRoute, ok, fail } from '@/server/http/handler';
import {
  mustGetModule, activeCycle, statusCounts, getNilDeclarations, declarableYears, periodsInUse,
} from '@/server/records/service';
import { viewColumnsFor } from '@/server/records/viewQuery';
import { toResponse } from '@/server/records/toResponse';
import { canViewModule, canCreateIn, canVerify } from '@/server/auth/permissions';
import { getAllLists } from '@/server/records/masterLists';
import { periodOptions, labelFor } from '@/server/records/periods';
import type { ModuleSchemaPayload } from '@darp/shared/contracts';

/**
 * The module's shape and the caller's standing in it — the form fields, whether they may
 * add or verify, and the status counts. No record contents. With no active cycle it still
 * answers, with no periods and zero counts, so a page can tell "not yours" from "not open".
 */
export const GET = withRoute({ rate: { limit: 120, windowSeconds: 60 } }, async ({ actor, params }) => {
  try {
    const m = mustGetModule(params.moduleKey!);
    if (!canViewModule(actor, m)) return fail('FORBIDDEN');

    const lists = await getAllLists();
    const cycle = await activeCycle();

    const periods = periodOptions(m, cycle);
    const years = new Set([...periods.map((p) => p.year), ...(await periodsInUse(actor, m.key))]);
    const recordPeriods = [...years].sort((a, b) => b - a).map((year) => ({ year, label: labelFor(year, m.periodType) }));
    const declaredYears = await getNilDeclarations(actor, m.key);

    return ok<ModuleSchemaPayload>({
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
      lookup: m.lookup
        ? {
          kind: m.lookup.kind, idFields: m.lookup.idFields, idLabel: m.lookup.idLabel,
          sourceName: m.lookup.sourceName ?? "the publisher's record",
        }
        : null,
      listColumns: m.listColumns,
      viewColumns: await viewColumnsFor(m),
      periods,
      recordPeriods,
      counts: await statusCounts(actor, m.key),
      declaredYears,
      declarableYears: declarableYears(declaredYears),
      fields: m.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: !!f.required,
        help: f.help ?? null,
        placeholder: f.placeholder ?? null,
        options: f.listKey ? (lists[f.listKey] ?? []) : (f.options ?? []),
        emptyLabel: f.emptyLabel ?? null,
        showIf: f.showIf ?? null,
        section: f.section ?? null,
        colSpan: f.colSpan ?? 1,
        maxLength: f.maxLength ?? null,
        accept: f.accept ?? null,
        maxSizeMB: f.maxSizeMB ?? null,
        notFuture: !!f.notFuture,
        unit: f.unit ?? null,
        // The browser is told a field is protected, but never why or how.
        protected: f.pii === 'encrypted' || !!f.sensitive,
        autofill: f.autofill
          ? { locked: f.autofill.locked, alwaysLocked: !!f.autofill.alwaysLocked, generated: f.autofill.from === 'citation' }
          : null,
      })),
      derived: (m.derived ?? []).map((d) => ({ key: d.key, label: d.label })),
    });
  } catch (e) {
    return toResponse(e);
  }
});
