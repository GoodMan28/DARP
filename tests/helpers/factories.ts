import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { users, departments } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import type { Role } from '@/modules/_types';

let n = 0;

export async function makeUser(opts: { role: Role; dept?: string; joined?: string }): Promise<SessionUser> {
  n += 1;
  let departmentId: string | null = null;
  let departmentName: string | null = null;
  let departmentCode: string | null = null;
  if (opts.dept) {
    const [d] = await db.select().from(departments).where(eq(departments.code, opts.dept));
    if (!d) throw new Error(`seed department ${opts.dept} missing — run npm run db:seed`);
    departmentId = d.id;
    departmentName = d.name;
    departmentCode = d.code;
  }
  const [u] = await db.insert(users).values({
    email: `t${n}.${Date.now()}@bitmesra.ac.in`,
    name: `Test ${opts.role} ${n}`,
    role: opts.role,
    departmentId,
    passwordHash: 'not-used-in-service-tests',
    dateOfJoining: opts.joined ?? '2015-07-01',
    mustChangePassword: false,
  }).returning();

  return {
    id: u!.id,
    email: u!.email,
    name: u!.name,
    role: opts.role,
    departmentId,
    departmentName,
    departmentCode,
    dateOfJoining: u!.dateOfJoining,
    mustChangePassword: false,
    sessionId: `test-session-${n}`,
  };
}
