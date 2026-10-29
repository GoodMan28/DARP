import { withRoute, ok } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { defaultRange } from '@/server/records/range';
import { modulesOwnedBy } from '@darp/shared/modules';
import type { DashboardPayload } from '@darp/shared/contracts';
import { moduleStatusForUser, departmentCompletion, verificationQueue } from '@/server/rollups/completion';
import { correctionsFor } from '@/server/records/service';
import { autoUpdatesFor } from '@/server/records/patentRefresh';

export const GET = withRoute({ rate: { limit: 60, windowSeconds: 60 } }, async ({ actor }) => {
  try {
    const range = await defaultRange();
    const ownsModules = modulesOwnedBy(actor.role).length > 0;

    const modules = ownsModules ? await moduleStatusForUser(actor, actor.id, actor.role) : [];

    // "Done" means the module has been answered: every row handed on, or a nil return.
    const done = modules.filter((m) => m.progress !== 'not_started' && m.progress !== 'in_progress').length;
    const notStarted = modules.filter((m) => m.progress === 'not_started').length;

    return ok<DashboardPayload>({
      cycle: { name: range.name, from: range.from, to: range.to },
      role: actor.role,
      ownsModules,
      modules,
      summary: {
        total: modules.length,
        notStarted,
        inProgress: modules.length - notStarted - done,
        done,
        pct: modules.length === 0 ? 0 : Math.round((done / modules.length) * 100),
      },
      // Only roles that verify get a queue, and only roles that oversee others get the table.
      queue: await verificationQueue(actor),
      departments: actor.role !== 'faculty' ? await departmentCompletion(actor) : [],
      corrections: await correctionsFor(actor),
      autoUpdates: await autoUpdatesFor(actor),
    });
  } catch (e) {
    return toResponse(e);
  }
});
