import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';

/** The account automatic approvals are recorded under. Inactive, so it can never sign in. */
export const SYSTEM_EMAIL = 'system@darp.invalid';
export const SYSTEM_NAME = 'DARP automatic check';

let cached: SessionUser | null = null;

export async function systemActor(): Promise<SessionUser> {
  if (cached) return cached;
  const [u] = await db.select().from(users).where(eq(users.email, SYSTEM_EMAIL)).limit(1);
  if (!u) throw new Error('The DARP system account is missing. Run `npm run db:seed`.');
  cached = {
    id: u.id, email: u.email, name: u.name, role: u.role,
    departmentId: null, departmentName: null, departmentCode: null,
    dateOfJoining: null, mustChangePassword: false, sessionId: 'system',
  };
  return cached;
}
