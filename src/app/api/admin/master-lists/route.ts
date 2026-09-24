import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { masterListItems } from '@/server/db/schema';
import { withRoute, ok, fail } from '@/server/http/handler';
import { invalidateListCache } from '@/server/records/masterLists';
import { audit } from '@/server/audit/log';
import { MODULE_LIST } from '@/modules';

/**
 * The catalogue of editable lists is derived from the module configs rather than
 * hand-listed, so a new `listKey` in a module appears here without a second edit
 * and an unknown key can never be created.
 */
const LIST_USAGE: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const m of MODULE_LIST) {
    for (const f of m.fields) {
      if (!f.listKey) continue;
      const used = map.get(f.listKey) ?? [];
      if (!used.includes(m.name)) used.push(m.name);
      map.set(f.listKey, used);
    }
  }
  return map;
})();

const LIST_KEYS: string[] = [...LIST_USAGE.keys()].sort();

const listKeySchema = z.string().refine((k) => LIST_USAGE.has(k), 'Unknown list.');

/* ─────────────────────────────── GET ──────────────────────────────── */

/** Every list, including deactivated values, so IQAC can see and restore them. */
export const GET = withRoute(
  { roles: ['admin'], capability: 'manageLists', rate: { limit: 60, windowSeconds: 60 } },
  async () => {
    const rows = await db
      .select({
        id: masterListItems.id,
        listKey: masterListItems.listKey,
        value: masterListItems.value,
        sortOrder: masterListItems.sortOrder,
        isActive: masterListItems.isActive,
        createdAt: masterListItems.createdAt,
      })
      .from(masterListItems)
      .orderBy(asc(masterListItems.listKey), asc(masterListItems.sortOrder), asc(masterListItems.value));

    const byKey = new Map<string, typeof rows>();
    for (const r of rows) {
      const bucket = byKey.get(r.listKey) ?? [];
      bucket.push(r);
      byKey.set(r.listKey, bucket);
    }

    // Keys present in the database but no longer referenced by any module are still shown.
    const keys = [...new Set([...LIST_KEYS, ...byKey.keys()])].sort();

    return ok({
      lists: keys.map((key) => ({
        listKey: key,
        usedBy: LIST_USAGE.get(key) ?? [],
        items: byKey.get(key) ?? [],
      })),
    });
  },
);

/* ────────────────────────── POST add a value ──────────────────────── */

const addSchema = z.object({
  listKey: listKeySchema,
  value: z.string().trim().min(1, 'Enter a value.').max(300),
});

export const POST = withRoute(
  { roles: ['admin'], capability: 'manageLists', schema: addSchema, rate: { limit: 60, windowSeconds: 60 } },
  async ({ actor, body, ip, userAgent }) => {
    const [existing] = await db
      .select({ id: masterListItems.id, isActive: masterListItems.isActive })
      .from(masterListItems)
      .where(and(eq(masterListItems.listKey, body.listKey), eq(masterListItems.value, body.value)))
      .limit(1);

    if (existing) {
      return fail('CONFLICT', {
        message: existing.isActive
          ? 'That value is already in this list.'
          : 'That value exists but is deactivated. Reactivate it instead of adding it again.',
        fields: { value: 'Already in this list.' },
      });
    }

    const [max] = await db
      .select({ next: sql<number>`coalesce(max(${masterListItems.sortOrder}), 0) + 1` })
      .from(masterListItems)
      .where(eq(masterListItems.listKey, body.listKey));

    const inserted = await db
      .insert(masterListItems)
      .values({ listKey: body.listKey, value: body.value, sortOrder: Number(max?.next ?? 1), isActive: true })
      .returning({
        id: masterListItems.id,
        listKey: masterListItems.listKey,
        value: masterListItems.value,
        sortOrder: masterListItems.sortOrder,
        isActive: masterListItems.isActive,
      });

    const item = inserted[0];
    if (!item) return fail('INTERNAL');

    invalidateListCache();

    await audit({
      actor, action: 'masterlist.update', entity: 'masterlist', entityId: item.id,
      ip, userAgent,
      after: { listKey: item.listKey, value: item.value, sortOrder: item.sortOrder, isActive: true },
      meta: { operation: 'add' },
    });

    return ok({ item });
  },
);

/* ─────────────── PATCH deactivate / activate / reorder ────────────── */

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('deactivate'), id: z.string().uuid() }),
  z.object({ action: z.literal('activate'), id: z.string().uuid() }),
  z.object({
    action: z.literal('reorder'),
    listKey: listKeySchema,
    orderedIds: z.array(z.string().uuid()).min(1).max(400),
  }),
]);

export const PATCH = withRoute(
  { roles: ['admin'], capability: 'manageLists', schema: patchSchema, rate: { limit: 60, windowSeconds: 60 } },
  async ({ actor, body, ip, userAgent }) => {
    if (body.action === 'reorder') {
      const rows = await db
        .select({ id: masterListItems.id, sortOrder: masterListItems.sortOrder })
        .from(masterListItems)
        .where(eq(masterListItems.listKey, body.listKey));

      const known = new Set(rows.map((r) => r.id));
      if (body.orderedIds.length !== rows.length || body.orderedIds.some((id) => !known.has(id))) {
        return fail('VALIDATION', { message: 'The list changed while you were reordering it. Reload and try again.' });
      }

      await db.transaction(async (tx) => {
        for (let i = 0; i < body.orderedIds.length; i += 1) {
          await tx
            .update(masterListItems)
            .set({ sortOrder: i + 1 })
            .where(eq(masterListItems.id, body.orderedIds[i]!));
        }
      });

      invalidateListCache();

      await audit({
        actor, action: 'masterlist.update', entity: 'masterlist', entityId: body.listKey,
        ip, userAgent,
        before: { order: rows.sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.id) },
        after: { order: body.orderedIds },
        meta: { operation: 'reorder', listKey: body.listKey },
      });

      return ok({ listKey: body.listKey, orderedIds: body.orderedIds });
    }

    const [item] = await db
      .select({
        id: masterListItems.id,
        listKey: masterListItems.listKey,
        value: masterListItems.value,
        sortOrder: masterListItems.sortOrder,
        isActive: masterListItems.isActive,
      })
      .from(masterListItems)
      .where(eq(masterListItems.id, body.id))
      .limit(1);

    if (!item) return fail('NOT_FOUND');

    const nextActive = body.action === 'activate';
    if (item.isActive === nextActive) return ok({ item });

    // Values are never deleted: existing records may already reference them.
    await db.update(masterListItems).set({ isActive: nextActive }).where(eq(masterListItems.id, item.id));

    invalidateListCache();

    await audit({
      actor, action: 'masterlist.update', entity: 'masterlist', entityId: item.id,
      ip, userAgent,
      before: { listKey: item.listKey, value: item.value, isActive: item.isActive },
      after: { listKey: item.listKey, value: item.value, isActive: nextActive },
      meta: { operation: body.action },
    });

    return ok({ item: { ...item, isActive: nextActive } });
  },
);
