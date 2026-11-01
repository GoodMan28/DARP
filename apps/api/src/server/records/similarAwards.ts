import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { records } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { canCreateIn } from '@/server/auth/permissions';
import { AWARD_MODULES, normAwardName } from '@darp/shared/awards';
import { mustGetModule } from './service';
import { scopeFilter } from './scope';

export interface SimilarAward { moduleKey: string; moduleName: string; recordId: string; name: string }

/**
 * The same award, entered somewhere else. IQAC keeps awards, R&I awards, extension awards and fellowships
 * as four sheets, so one award can be entered in two of them; this lets the form say so. It only ever
 * reads the caller's own records (scopeFilter, and their own as owner), and it never refuses anything.
 */
export async function similarAwards(
  actor: SessionUser, input: { name: string; date: string; excludeId?: string },
): Promise<SimilarAward[]> {
  const wanted = normAwardName(input.name);
  if (wanted.length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return [];
  const found: SimilarAward[] = [];
  for (const a of AWARD_MODULES) {
    const m = mustGetModule(a.moduleKey);
    if (!canCreateIn(actor, m)) continue;
    const rows = await db.select({ id: records.id, data: records.data }).from(records)
      .where(and(
        scopeFilter(actor, m),
        eq(records.ownerUserId, actor.id),
        sql`${records.data} ->> ${a.dateField} = ${input.date}`,
        ...(input.excludeId ? [ne(records.id, input.excludeId)] : []),
      ))
      .limit(50);
    for (const r of rows) {
      const name = String((r.data as Record<string, unknown>)[a.nameField] ?? '');
      if (normAwardName(name) === wanted) found.push({ moduleKey: a.moduleKey, moduleName: m.name, recordId: r.id, name });
    }
  }
  return found.slice(0, 5);
}
