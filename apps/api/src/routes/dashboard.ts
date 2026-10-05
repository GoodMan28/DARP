import { eq } from 'drizzle-orm';
import { withRoute, ok } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { db } from '@/server/db';
import { cycles } from '@/server/db/schema';
import { modulesOwnedBy } from '@darp/shared/modules';
import type { DashboardPayload } from '@darp/shared/contracts';
import { moduleStatusForUser, departmentCompletion, verificationQueue } from '@/server/rollups/completion';

export const GET = withRoute({ rate: { limit: 60, windowSeconds: 60 } }, async ({ actor }) => {
  try {
    const [cycle] = await db.select().from(cycles).where(eq(cycles.isActive, true)).limit(1);
    const ownsModules = modulesOwnedBy(actor.role).length > 0;

    // With no active cycle there is nothing to count; the page explains why.
    if (!cycle) {
      return ok<DashboardPayload>({
        cycle: null,
        role: actor.role,
        ownsModules,
        modules: [],
        summary: { total: 0, notStarted: 0, inProgress: 0, done: 0, pct: 0 },
        queue: [],
        departments: [],
      });
    }

    const modules = ownsModules ? await moduleStatusForUser(actor, actor.id, actor.role) : [];

    // "Done" means the module has been answered: every row handed on, or a nil return.
    const done = modules.filter((m) => m.progress !== 'not_started' && m.progress !== 'in_progress').length;
    const notStarted = modules.filter((m) => m.progress === 'not_started').length;

    return ok<DashboardPayload>({
      cycle: {
        name: cycle.name,
        deadlineAt: cycle.deadlineAt ? cycle.deadlineAt.toISOString() : null,
        entryOpensAt: cycle.entryOpensAt ? cycle.entryOpensAt.toISOString() : null,
      },
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
    });
  } catch (e) {
    return toResponse(e);
  }
});
