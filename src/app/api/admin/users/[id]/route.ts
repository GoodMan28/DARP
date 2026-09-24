import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { users, departments } from '@/server/db/schema';
import { withRoute, ok, fail } from '@/server/http/handler';
import { hashPassword, PasswordPolicyError } from '@/server/auth/password';
import { revokeAllSessionsForUser } from '@/server/auth/session';
import { audit } from '@/server/audit/log';

/* Duplicated from ../route.ts on purpose: a Next.js route module may not export
   anything but its handlers, so a shared helper cannot live in a sibling route. */
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*+-=?';
const TEMP_PASSWORD_LENGTH = 16;

function pick(set: string): string {
  return set.charAt(randomInt(set.length));
}

function generateTemporaryPassword(): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < TEMP_PASSWORD_LENGTH) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const a = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = a;
  }
  return chars.join('');
}

const ROLE_VALUES = ['faculty', 'hod', 'dofa', 'drie', 'dugs', 'cdc', 'admin'] as const;
const DEPARTMENT_REQUIRED_ROLES: readonly string[] = ['faculty', 'hod'];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker.');

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'),
    name: z.string().trim().min(2, 'Enter the full name.').max(160),
    email: z.string().trim().toLowerCase().email('Enter a valid e-mail address.').max(200),
    role: z.enum(ROLE_VALUES),
    departmentId: z.string().uuid('Choose a department.').nullish(),
    employeeId: z.string().trim().max(40).nullish(),
    dateOfJoining: isoDate.nullish(),
  }),
  z.object({ action: z.literal('deactivate') }),
  z.object({ action: z.literal('activate') }),
  z.object({ action: z.literal('resetPassword') }),
]);

/**
 * Update, deactivate, reactivate or reset the password of one account.
 * Admin-only (role AND the `manageUsers` capability). Every branch is audited
 * with a before/after snapshot that never contains a password hash.
 */
export const PATCH = withRoute(
  { roles: ['admin'], capability: 'manageUsers', schema, rate: { limit: 60, windowSeconds: 300 } },
  async ({ actor, body, params, ip, userAgent }) => {
    const idCheck = z.string().uuid().safeParse(params.id);
    if (!idCheck.success) return fail('NOT_FOUND');
    const targetId = idCheck.data;

    const [target] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        departmentId: users.departmentId,
        employeeId: users.employeeId,
        dateOfJoining: users.dateOfJoining,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
      })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1);

    if (!target) return fail('NOT_FOUND');

    const before = { ...target };

    /* ───────────────────────────── update ──────────────────────────── */
    if (body.action === 'update') {
      // Mirrors `users_department_rule`; a clean 422 instead of a constraint 500.
      if (DEPARTMENT_REQUIRED_ROLES.includes(body.role) && !body.departmentId) {
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
      }

      if (body.email !== target.email.toLowerCase()) {
        const [clash] = await db
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${body.email}`)
          .limit(1);
        if (clash && clash.id !== targetId) {
          return fail('VALIDATION', { fields: { email: 'An account already uses that e-mail address.' } });
        }
      }

      if (targetId === actor.id && body.role !== 'admin') {
        return fail('VALIDATION', {
          message: 'You cannot remove your own IQAC role. Ask another administrator to do it.',
          fields: { role: 'Keep your own account on the IQAC role.' },
        });
      }

      const updated = await db
        .update(users)
        .set({
          name: body.name,
          email: body.email,
          role: body.role,
          departmentId,
          employeeId: body.employeeId ?? null,
          dateOfJoining: body.dateOfJoining ?? null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetId))
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
        });

      const after = updated[0];
      if (!after) return fail('INTERNAL');

      await audit({
        actor, action: 'user.update', entity: 'user', entityId: targetId,
        ip, userAgent, before, after,
      });
      return ok({ user: after });
    }

    /* ─────────────────────────── deactivate ────────────────────────── */
    if (body.action === 'deactivate') {
      if (targetId === actor.id) {
        return fail('VALIDATION', { message: 'You cannot deactivate your own account.' });
      }
      if (!target.isActive) return ok({ user: target });

      await db
        .update(users)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(users.id, targetId));

      // Their sessions must die immediately, not at the next idle timeout.
      await revokeAllSessionsForUser(targetId);

      await audit({
        actor, action: 'user.deactivate', entity: 'user', entityId: targetId,
        ip, userAgent,
        before: { isActive: true },
        after: { isActive: false },
        meta: { sessionsRevoked: true, email: target.email },
      });
      return ok({ user: { ...target, isActive: false } });
    }

    /* ──────────────────────────── activate ─────────────────────────── */
    if (body.action === 'activate') {
      if (target.isActive) return ok({ user: target });

      await db
        .update(users)
        .set({ isActive: true, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, targetId));

      await audit({
        actor, action: 'user.update', entity: 'user', entityId: targetId,
        ip, userAgent,
        before: { isActive: false },
        after: { isActive: true },
        meta: { reactivated: true, email: target.email },
      });
      return ok({ user: { ...target, isActive: true } });
    }

    /* ───────────────────────── reset password ──────────────────────── */
    const temporaryPassword = generateTemporaryPassword();
    let passwordHash: string;
    try {
      passwordHash = await hashPassword(temporaryPassword);
    } catch (e) {
      if (e instanceof PasswordPolicyError) return fail('INTERNAL');
      throw e;
    }

    await db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetId));

    // A reset invalidates every device, including any attacker still signed in.
    await revokeAllSessionsForUser(targetId);

    await audit({
      actor, action: 'user.update', entity: 'user', entityId: targetId,
      ip, userAgent,
      before: { mustChangePassword: target.mustChangePassword },
      after: { mustChangePassword: true },
      meta: { passwordReset: true, sessionsRevoked: true, email: target.email },
    });

    // Shown to the admin once; nothing plaintext is stored or logged.
    return ok({ user: { ...target, mustChangePassword: true }, temporaryPassword });
  },
);
