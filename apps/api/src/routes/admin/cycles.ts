import { z } from 'zod';
import { desc, eq, ne } from 'drizzle-orm';
import { db } from '@/server/db';
import { cycles } from '@/server/db/schema';
import { withRoute, ok, fail } from '@/server/http/handler';
import { audit } from '@/server/audit/log';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker.');
const isoDateTime = z.string().datetime({ offset: true });

/* ─────────────────────────────── GET ──────────────────────────────── */

export const GET = withRoute(
  { roles: ['admin'], capability: 'manageCycle', rate: { limit: 60, windowSeconds: 60 } },
  async () => {
    const rows = await db
      .select({
        id: cycles.id,
        name: cycles.name,
        isActive: cycles.isActive,
        cyStart: cycles.cyStart,
        cyEnd: cycles.cyEnd,
        fyStart: cycles.fyStart,
        fyEnd: cycles.fyEnd,
        ayStart: cycles.ayStart,
        ayEnd: cycles.ayEnd,
        entryOpensAt: cycles.entryOpensAt,
        deadlineAt: cycles.deadlineAt,
        createdAt: cycles.createdAt,
      })
      .from(cycles)
      .orderBy(desc(cycles.isActive), desc(cycles.createdAt));

    return ok({ cycles: rows });
  },
);

/* ─────────────────────────────── PATCH ────────────────────────────── */

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(3).max(160).optional(),
  cyStart: isoDate.optional(),
  cyEnd: isoDate.optional(),
  fyStart: isoDate.optional(),
  fyEnd: isoDate.optional(),
  ayStart: isoDate.optional(),
  ayEnd: isoDate.optional(),
  /** null clears the date; omit the key to leave it untouched. */
  entryOpensAt: isoDateTime.nullable().optional(),
  deadlineAt: isoDateTime.nullable().optional(),
  /** Only `true` is meaningful: the schema forbids two active cycles, and a
   *  portal with no active cycle has nowhere to file records. */
  isActive: z.literal(true).optional(),
});

const WINDOWS: ReadonlyArray<{ label: string; start: 'cyStart' | 'fyStart' | 'ayStart'; end: 'cyEnd' | 'fyEnd' | 'ayEnd' }> = [
  { label: 'calendar year', start: 'cyStart', end: 'cyEnd' },
  { label: 'financial year', start: 'fyStart', end: 'fyEnd' },
  { label: 'academic year', start: 'ayStart', end: 'ayEnd' },
];

export const PATCH = withRoute(
  { roles: ['admin'], capability: 'manageCycle', schema: patchSchema, rate: { limit: 30, windowSeconds: 300 } },
  async ({ actor, body, ip, userAgent }) => {
    const [current] = await db
      .select({
        id: cycles.id,
        name: cycles.name,
        isActive: cycles.isActive,
        cyStart: cycles.cyStart,
        cyEnd: cycles.cyEnd,
        fyStart: cycles.fyStart,
        fyEnd: cycles.fyEnd,
        ayStart: cycles.ayStart,
        ayEnd: cycles.ayEnd,
        entryOpensAt: cycles.entryOpensAt,
        deadlineAt: cycles.deadlineAt,
      })
      .from(cycles)
      .where(eq(cycles.id, body.id))
      .limit(1);

    if (!current) return fail('NOT_FOUND');

    const merged = {
      cyStart: body.cyStart ?? current.cyStart,
      cyEnd: body.cyEnd ?? current.cyEnd,
      fyStart: body.fyStart ?? current.fyStart,
      fyEnd: body.fyEnd ?? current.fyEnd,
      ayStart: body.ayStart ?? current.ayStart,
      ayEnd: body.ayEnd ?? current.ayEnd,
    };

    const fields: Record<string, string> = {};
    for (const w of WINDOWS) {
      if (merged[w.start] >= merged[w.end]) {
        fields[w.end] = `The ${w.label} must end after it starts.`;
      }
    }
    if (Object.keys(fields).length > 0) {
      return fail('VALIDATION', { message: 'Check the reporting windows.', fields });
    }

    const entryOpensAt = body.entryOpensAt === undefined
      ? current.entryOpensAt
      : body.entryOpensAt === null ? null : new Date(body.entryOpensAt);
    const deadlineAt = body.deadlineAt === undefined
      ? current.deadlineAt
      : body.deadlineAt === null ? null : new Date(body.deadlineAt);

    if (entryOpensAt && deadlineAt && entryOpensAt >= deadlineAt) {
      return fail('VALIDATION', {
        message: 'The deadline must come after entry opens.',
        fields: { deadlineAt: 'Choose a date after entry opens.' },
      });
    }

    const nextActive = body.isActive === true ? true : current.isActive;

    const updated = await db.transaction(async (tx) => {
      // The unique partial index allows only one active cycle, so the others are
      // stood down inside the same transaction rather than failing the update.
      if (body.isActive === true && !current.isActive) {
        await tx.update(cycles).set({ isActive: false }).where(ne(cycles.id, body.id));
      }
      const rows = await tx
        .update(cycles)
        .set({
          ...(body.name ? { name: body.name } : {}),
          ...merged,
          entryOpensAt,
          deadlineAt,
          isActive: nextActive,
        })
        .where(eq(cycles.id, body.id))
        .returning({
          id: cycles.id,
          name: cycles.name,
          isActive: cycles.isActive,
          cyStart: cycles.cyStart,
          cyEnd: cycles.cyEnd,
          fyStart: cycles.fyStart,
          fyEnd: cycles.fyEnd,
          ayStart: cycles.ayStart,
          ayEnd: cycles.ayEnd,
          entryOpensAt: cycles.entryOpensAt,
          deadlineAt: cycles.deadlineAt,
        });
      return rows[0];
    });

    if (!updated) return fail('INTERNAL');

    await audit({
      actor, action: 'cycle.update', entity: 'cycle', entityId: updated.id,
      ip, userAgent, before: current, after: updated,
    });

    return ok({ cycle: updated });
  },
);
