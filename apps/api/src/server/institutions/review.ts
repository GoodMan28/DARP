import { asc, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { institutions, users } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { ServiceError } from '@/server/records/service';
import { institutionUsage } from '@/server/records/institutionMerge';
import { hitOf } from './service';
import type { PendingInstitute } from './propose';

/** The organisations people added that IQAC has not reviewed yet, with how many records use each. IQAC only. */
export async function listPending(actor: SessionUser): Promise<PendingInstitute[]> {
  if (actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 'Only IQAC may review added organisations.');
  const rows = await db.select({ i: institutions, by: users.name }).from(institutions)
    .leftJoin(users, eq(users.id, institutions.addedBy))
    .where(eq(institutions.status, 'pending'))
    .orderBy(asc(institutions.createdAt));
  const used = await institutionUsage(actor, rows.map((r) => r.i.code));
  return rows.map((r) => ({
    ...hitOf(r.i), kind: r.i.kind, addedBy: r.by, addedAt: r.i.createdAt.toISOString(), records: used.get(r.i.code) ?? 0,
  }));
}

/** Approves an added organisation as it is. It keeps its DARP code. */
export async function approveInstitute(actor: SessionUser, code: string) {
  if (actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 'Only IQAC may approve an added organisation.');
  const [row] = await db.update(institutions).set({ status: 'active' }).where(eq(institutions.code, code)).returning();
  if (!row) throw new ServiceError('NOT_FOUND', 'That institute is not in the directory.');
  return hitOf(row);
}
