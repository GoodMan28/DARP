import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { records } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { canCreateIn } from '@/server/auth/permissions';
import { mustGetModule } from './service';
import { scopeFilter } from './scope';

export interface EarlierStudent {
  studentName?: string;
  program?: string;
  specialisation?: string;
  email?: string;
  phone?: string;
}

/**
 * A student the person entered before, found by roll number in their own Students Guided and Student
 * Mentorship records, so the same student is not typed again each year. Only the caller's own records
 * are read (scopeFilter, and their own as owner): another teacher's students are never offered.
 */
export async function earlierStudent(actor: SessionUser, rollNo: string): Promise<EarlierStudent | null> {
  const key = rollNo.trim().toLowerCase();
  if (key.length < 3) return null;
  const found: Array<{ at: Date; data: Record<string, unknown>; branchKey: string }> = [];
  for (const [moduleKey, branchKey] of [['studentsguided', 'specialisation'], ['mentorship', 'branch']] as const) {
    const m = mustGetModule(moduleKey);
    if (!canCreateIn(actor, m)) continue;
    const [row] = await db.select({ data: records.data, at: records.updatedAt }).from(records)
      .where(and(scopeFilter(actor, m), eq(records.ownerUserId, actor.id), sql`lower(${records.data} ->> 'rollNo') = ${key}`))
      .orderBy(desc(records.updatedAt)).limit(1);
    if (row) found.push({ at: row.at, data: row.data as Record<string, unknown>, branchKey });
  }
  found.sort((a, b) => b.at.getTime() - a.at.getTime());
  const out: EarlierStudent = {};
  const take = (k: keyof EarlierStudent, v: unknown) => { if (!out[k] && typeof v === 'string' && v.trim()) out[k] = v.trim(); };
  for (const f of found) {
    take('studentName', f.data.studentName);
    take('program', f.data.program);
    take('specialisation', f.data[f.branchKey]);
    take('email', f.data.email);
    take('phone', f.data.phone);
  }
  return Object.keys(out).length > 0 ? out : null;
}
