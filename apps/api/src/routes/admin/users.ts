import { z } from 'zod';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { users, departments } from '@/server/db/schema';
import { withRoute, ok, fail } from '@/server/http/handler';
import { hashPassword, PasswordPolicyError } from '@/server/auth/password';
import { audit } from '@/server/audit/log';
import { generateTemporaryPassword, ROLE_VALUES, DEPARTMENT_REQUIRED_ROLES } from '@/server/auth/accounts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker.');

/* ─────────────────────────────── GET list ───────────────────────────── */

export const GET = withRoute(
  { roles: ['admin'], capability: 'manageUsers', rate: { limit: 60, windowSeconds: 60 } },
  async () => {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        departmentId: users.departmentId,
        departmentCode: departments.code,
        departmentName: departments.name,
        employeeId: users.employeeId,
        dateOfJoining: users.dateOfJoining,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
        lockedUntil: users.lockedUntil,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .orderBy(asc(users.name));

    const depts = await db
      .select({ id: departments.id, code: departments.code, name: departments.name, isActive: departments.isActive })
      .from(departments)
      .orderBy(asc(departments.code));

    return ok({ users: rows, departments: depts });
  },
);

/* ────────────────────────────── POST create ─────────────────────────── */

const createSchema = z.object({
  name: z.string().trim().min(2, 'Enter the full name.').max(160),
  email: z.string().trim().toLowerCase().email('Enter a valid e-mail address.').max(200),
  role: z.enum(ROLE_VALUES),
  departmentId: z.string().uuid('Choose a department.').nullish(),
  employeeId: z.string().trim().max(40).nullish(),
  dateOfJoining: isoDate.nullish(),
});

export const POST = withRoute(
  { roles: ['admin'], capability: 'manageUsers', schema: createSchema, rate: { limit: 30, windowSeconds: 300 } },
  async ({ actor, body, ip, userAgent }) => {
    // The department rule is checked here, before the insert, so the constraint never fires.
    const needsDepartment = DEPARTMENT_REQUIRED_ROLES.includes(body.role);
    if (needsDepartment && !body.departmentId) {
      return fail('VALIDATION', {
        message: 'A faculty or HOD account must belong to a department.',
        fields: { departmentId: 'Choose the department this account belongs to.' },
      });
    }

    const departmentId = body.departmentId ?? null;
    if (departmentId) {
      const [dept] = await db
        .select({ id: departments.id, isActive: departments.isActive })
        .from(departments)
        .where(eq(departments.id, departmentId))
        .limit(1);
      if (!dept) return fail('VALIDATION', { fields: { departmentId: 'That department does not exist.' } });
      if (!dept.isActive) return fail('VALIDATION', { fields: { departmentId: 'That department is no longer active.' } });
    }

    const [clash] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${body.email}`)
      .limit(1);
    if (clash) {
      return fail('VALIDATION', { fields: { email: 'An account already uses that e-mail address.' } });
    }

    const temporaryPassword = generateTemporaryPassword();
    let passwordHash: string;
    try {
      passwordHash = await hashPassword(temporaryPassword);
    } catch (e) {
      // Unreachable for a generated password; handled so a policy change can never 500.
      if (e instanceof PasswordPolicyError) return fail('INTERNAL');
      throw e;
    }

    const inserted = await db
      .insert(users)
      .values({
        name: body.name,
        email: body.email,
        role: body.role,
        departmentId,
        employeeId: body.employeeId ?? null,
        dateOfJoining: body.dateOfJoining ?? null,
        passwordHash,
        mustChangePassword: true,
        isActive: true,
        createdBy: actor.id,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        departmentId: users.departmentId,
        employeeId: users.employeeId,
        dateOfJoining: users.dateOfJoining,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
        createdAt: users.createdAt,
      });

    const created = inserted[0];
    if (!created) return fail('INTERNAL');

    await audit({
      actor,
      action: 'user.create',
      entity: 'user',
      entityId: created.id,
      ip,
      userAgent,
      after: {
        name: created.name,
        email: created.email,
        role: created.role,
        departmentId: created.departmentId,
        employeeId: created.employeeId,
        dateOfJoining: created.dateOfJoining,
        mustChangePassword: true,
      },
      meta: { temporaryPasswordIssued: true },
    });

    // The only time the plaintext leaves the server. It is not stored anywhere.
    return ok({ user: created, temporaryPassword });
  },
);
