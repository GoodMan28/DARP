import { z } from 'zod';
import { asc, count, eq, and } from 'drizzle-orm';
import { db } from '@/server/db';
import { departments, users } from '@/server/db/schema';
import { withRoute, ok, fail } from '@/server/http/handler';
import { audit } from '@/server/audit/log';

/**
 * The departments, for IQAC to keep: BIT opens, merges and renames them. A department is never deleted
 * (its people and records point to it); renaming changes the name in lists and exports, not who belongs where.
 */

/** GET /api/admin/departments — every department, with how many active people it has. */
export const GET = withRoute(
  { roles: ['admin'], capability: 'manageLists', rate: { limit: 60, windowSeconds: 60 } },
  async () => {
    const rows = await db.select({
      id: departments.id, code: departments.code, name: departments.name, isActive: departments.isActive, people: count(users.id),
    }).from(departments)
      .leftJoin(users, and(eq(users.departmentId, departments.id), eq(users.isActive, true)))
      .groupBy(departments.id)
      .orderBy(asc(departments.name));
    return ok({ departments: rows });
  },
);

const addSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,8}$/, 'Use 2 to 8 capital letters, for example CSE.'),
  name: z.string().trim().min(3, 'Enter the full name.').max(120),
});

/** POST /api/admin/departments — add one. */
export const POST = withRoute(
  { roles: ['admin'], capability: 'manageLists', schema: addSchema, rate: { limit: 30, windowSeconds: 60 } },
  async ({ actor, body, ip, userAgent }) => {
    const [taken] = await db.select({ id: departments.id }).from(departments).where(eq(departments.code, body.code)).limit(1);
    if (taken) return fail('CONFLICT', { message: 'That code is already used.', fields: { code: 'Already used by another department.' } });
    const [created] = await db.insert(departments).values({ code: body.code, name: body.name }).returning();
    await audit({ actor, action: 'department.update', entity: 'department', entityId: created!.id, ip, userAgent, after: { code: body.code, name: body.name }, meta: { operation: 'add' } });
    return ok({ department: created });
  },
);

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(3).max(120).optional(),
  isActive: z.boolean().optional(),
});

/** PATCH /api/admin/departments — rename, or switch off or on. */
export const PATCH = withRoute(
  { roles: ['admin'], capability: 'manageLists', schema: patchSchema, rate: { limit: 60, windowSeconds: 60 } },
  async ({ actor, body, ip, userAgent }) => {
    const [before] = await db.select().from(departments).where(eq(departments.id, body.id)).limit(1);
    if (!before) return fail('NOT_FOUND');
    if (body.isActive === false && before.isActive) {
      const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(users).where(and(eq(users.departmentId, body.id), eq(users.isActive, true)));
      if (n > 0) return fail('VALIDATION', { message: `Move its ${n} ${n === 1 ? 'person' : 'people'} to another department first.` });
    }
    const [after] = await db.update(departments)
      .set({ ...(body.name ? { name: body.name } : {}), ...(body.isActive === undefined ? {} : { isActive: body.isActive }) })
      .where(eq(departments.id, body.id)).returning();
    await audit({
      actor, action: 'department.update', entity: 'department', entityId: body.id, ip, userAgent,
      before: { name: before.name, isActive: before.isActive }, after: { name: after!.name, isActive: after!.isActive },
      meta: { operation: body.name ? 'rename' : body.isActive ? 'activate' : 'deactivate' },
    });
    return ok({ department: after });
  },
);
