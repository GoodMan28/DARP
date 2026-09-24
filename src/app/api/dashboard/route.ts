import { eq } from 'drizzle-orm';
import { withRoute, ok } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { db } from '@/server/db';
import { cycles } from '@/server/db/schema';
import {
  moduleStatusForUser, departmentCompletion, verificationQueue,
  type DepartmentCompletionRow, type ModuleStatusRow, type VerificationQueueRow,
} from '@/server/rollups/completion';

interface DashboardPayload {
  cycle: { name: string; deadlineAt: string | null; entryOpensAt: string | null } | null;
  role: string;
  /** The modules the caller must fill in themselves, with their progress. */
  modules: ModuleStatusRow[];
  summary: { total: number; notStarted: number; inProgress: number; done: number; pct: number };
  queue?: VerificationQueueRow[];
  departments?: DepartmentCompletionRow[];
}

export const GET = withRoute({ rate: { limit: 60, windowSeconds: 60 } }, async ({ actor }) => {
  try {
    const [cycle] = await db.select().from(cycles).where(eq(cycles.isActive, true)).limit(1);
    const modules = await moduleStatusForUser(actor, actor.id, actor.role);

    // "Done" means the module has been answered: every row handed on, or a nil return.
    const done = modules.filter((m) => m.progress !== 'not_started' && m.progress !== 'in_progress').length;
    const notStarted = modules.filter((m) => m.progress === 'not_started').length;

    const payload: DashboardPayload = {
      cycle: cycle
        ? {
          name: cycle.name,
          deadlineAt: cycle.deadlineAt ? cycle.deadlineAt.toISOString() : null,
          entryOpensAt: cycle.entryOpensAt ? cycle.entryOpensAt.toISOString() : null,
        }
        : null,
      role: actor.role,
      modules,
      summary: {
        total: modules.length,
        notStarted,
        inProgress: modules.length - notStarted - done,
        done,
        pct: modules.length === 0 ? 0 : Math.round((done / modules.length) * 100),
      },
    };

    // Only roles that verify get a queue, and only roles that oversee others get the table.
    const queue = await verificationQueue(actor);
    if (queue.length > 0) payload.queue = queue;
    if (actor.role !== 'faculty') payload.departments = await departmentCompletion(actor);

    return ok(payload);
  } catch (e) {
    return toResponse(e);
  }
});
