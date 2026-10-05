import { withRoute, ok, fail } from '@/server/http/handler';
import {
  mustGetModule, activeCycle, statusCounts, getNilDeclaration, ServiceError,
} from '@/server/records/service';
import { toResponse } from '@/server/records/toResponse';
import { canViewModule, canCreateIn, canVerify } from '@/server/auth/permissions';
import { getAllLists } from '@/server/records/masterLists';
import { periodOptions } from '@/server/records/periods';
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
    const cycle = await activeCycle().catch((e: unknown) => {
      if (e instanceof ServiceError) return null;
      throw e;
    });

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
      listColumns: m.listColumns,
      periods: cycle ? periodOptions(m, cycle) : [],
      counts: cycle
        ? await statusCounts(actor, m.key)
        : { draft: 0, submitted: 0, verified: 0, approved: 0, returned: 0 },
      declaredNil: cycle ? await getNilDeclaration(actor, m.key) : false,
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
