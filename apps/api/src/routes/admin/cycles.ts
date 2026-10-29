import { z } from 'zod';
import { desc, eq, ne } from 'drizzle-orm';
import { db } from '@/server/db';
import { cycles } from '@/server/db/schema';
import { withRoute, ok, fail } from '@/server/http/handler';
import { audit } from '@/server/audit/log';
import { windowsOfRange, MIN_YEAR, MAX_YEAR } from '@/server/records/range';

/*
 * Saved year ranges. A range is only a name and a first and last year; the one marked default is what
 * profiles and reports start with. No range ever hides a record.
 */

const year = z.number().int().min(MIN_YEAR).max(MAX_YEAR);

function shape(r: typeof cycles.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    isDefault: r.isActive,
    from: Number(r.cyStart.slice(0, 4)),
    to: Number(r.cyEnd.slice(0, 4)),
    createdAt: r.createdAt,
  };
}

function windows(from: number, to: number) {
  const w = windowsOfRange({ from, to }, '');
  return { cyStart: w.cyStart, cyEnd: w.cyEnd, fyStart: w.fyStart, fyEnd: w.fyEnd, ayStart: w.ayStart, ayEnd: w.ayEnd };
}

export const GET = withRoute(
  { roles: ['admin'], capability: 'manageCycle', rate: { limit: 60, windowSeconds: 60 } },
  async () => {
    const rows = await db.select().from(cycles).orderBy(desc(cycles.isActive), desc(cycles.createdAt));
    return ok({ ranges: rows.map(shape) });
  },
);

const createSchema = z.object({
  name: z.string().trim().min(3).max(160),
  from: year,
  to: year,
  makeDefault: z.boolean().optional(),
});

export const POST = withRoute(
  { roles: ['admin'], capability: 'manageCycle', schema: createSchema, rate: { limit: 30, windowSeconds: 300 } },
  async ({ actor, body, ip, userAgent }) => {
    if (body.from > body.to) {
      return fail('VALIDATION', { message: 'The first year cannot be after the last.', fields: { to: 'Choose a year on or after the first.' } });
    }
    const created = await db.transaction(async (tx) => {
      if (body.makeDefault) await tx.update(cycles).set({ isActive: false });
      const [row] = await tx.insert(cycles).values({
        name: body.name, isActive: !!body.makeDefault, ...windows(body.from, body.to),
      }).returning();
      return row!;
    });
    await audit({ actor, action: 'cycle.update', entity: 'cycle', entityId: created.id, after: shape(created), ip, userAgent });
    return ok(shape(created));
  },
);

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(3).max(160).optional(),
  from: year.optional(),
  to: year.optional(),
  /** Only `true` is meaningful: one range is the default at a time. */
  makeDefault: z.literal(true).optional(),
});

export const PATCH = withRoute(
  { roles: ['admin'], capability: 'manageCycle', schema: patchSchema, rate: { limit: 30, windowSeconds: 300 } },
  async ({ actor, body, ip, userAgent }) => {
    const [current] = await db.select().from(cycles).where(eq(cycles.id, body.id)).limit(1);
    if (!current) return fail('NOT_FOUND');
    const cur = shape(current);
    const from = body.from ?? cur.from;
    const to = body.to ?? cur.to;
    if (from > to) {
      return fail('VALIDATION', { message: 'The first year cannot be after the last.', fields: { to: 'Choose a year on or after the first.' } });
    }
    const updated = await db.transaction(async (tx) => {
      if (body.makeDefault && !current.isActive) await tx.update(cycles).set({ isActive: false }).where(ne(cycles.id, body.id));
      const [row] = await tx.update(cycles).set({
        name: body.name ?? current.name,
        isActive: body.makeDefault ? true : current.isActive,
        ...windows(from, to),
      }).where(eq(cycles.id, body.id)).returning();
      return row!;
    });
    await audit({ actor, action: 'cycle.update', entity: 'cycle', entityId: body.id, before: cur, after: shape(updated), ip, userAgent });
    return ok(shape(updated));
  },
);

export const DELETE = withRoute(
  { roles: ['admin'], capability: 'manageCycle', schema: z.object({ id: z.string().uuid() }), rate: { limit: 30, windowSeconds: 300 } },
  async ({ actor, body, ip, userAgent }) => {
    const [current] = await db.select().from(cycles).where(eq(cycles.id, body.id)).limit(1);
    if (!current) return fail('NOT_FOUND');
    // Records keep their own years; deleting a saved range only forgets the name.
    await db.delete(cycles).where(eq(cycles.id, body.id));
    await audit({ actor, action: 'cycle.update', entity: 'cycle', entityId: body.id, before: shape(current), meta: { deleted: true }, ip, userAgent });
    return ok({ id: body.id, deleted: true });
  },
);
