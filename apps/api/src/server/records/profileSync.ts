import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { records } from '@/server/db/schema';

/**
 * The profile record keeps the account's name and joining date, because IQAC's Profile sheet asks for
 * them. When IQAC changes an account, the copy follows. (A write only: no record is read here.)
 */
export async function syncProfileFromAccount(userId: string, name: string, dateOfJoining: string | null) {
  await db.update(records)
    .set({ data: sql`${records.data} || ${JSON.stringify({ name, joiningDate: dateOfJoining ?? '' })}::jsonb` })
    .where(and(eq(records.moduleKey, 'profile'), eq(records.ownerUserId, userId), isNull(records.deletedAt)));
}
