import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { records, institutions } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { MODULES } from '@darp/shared/modules';
import { HOME_INSTITUTE, institutionText } from '@darp/shared/institutions';
import { buildNaturalKey, buildSearchText } from './prepare';
import { ServiceError } from './service';
import { scopeFilter } from './scope';

/** Every institute box in every module, with the key its ID is kept under (organisation → organisationCode). */
export function institutionFields(): Array<{ moduleKey: string; key: string; codeKey: string; copy: boolean }> {
  return Object.values(MODULES).flatMap((m) => m.fields
    .filter((f) => f.type === 'institution')
    // A hidden copy of another box (a MoU asks its organisation twice) follows it: it is not counted as a use of its own.
    .map((f) => ({ moduleKey: m.key, key: f.key, codeKey: `${f.key}Code`, copy: !!f.hidden && f.computed?.kind === 'copy' })));
}

/**
 * How many records use each of some institutes, over every module. IQAC only: it reads every record,
 * through each module's own scope (scopeFilter), and returns counts, never a record.
 */
export async function institutionUsage(actor: SessionUser, codes: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 'Only IQAC may see this.');
  if (codes.length === 0) return out;
  for (const f of institutionFields().filter((x) => !x.copy)) {
    const m = MODULES[f.moduleKey]!;
    const code = sql<string>`${records.data} ->> ${f.codeKey}`;
    const rows = await db.select({ code, n: sql<number>`count(*)::int` }).from(records)
      .where(and(scopeFilter(actor, m), inArray(code, codes)))
      .groupBy(sql`1`);
    for (const r of rows) out.set(r.code, (out.get(r.code) ?? 0) + r.n);
  }
  return out;
}

/**
 * One institute folded into another: every record that names `from` now names `into`, in every module
 * (its text and its ID, and the duplicate-guard key and search text that follow them), and `from` is
 * marked merged so its old ID still finds `into`. Nothing is re-encrypted. A record whose new key
 * would collide with an existing one keeps its old key and is counted, never failed. IQAC only.
 */
export async function mergeInstitute(actor: SessionUser, from: string, into: string): Promise<{ records: number; keyClashes: number }> {
  if (actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 'Only IQAC may merge institutes.');
  if (from === into) throw new ServiceError('VALIDATION', 'Choose a different institute to merge into.');
  if (from === HOME_INSTITUTE) throw new ServiceError('VALIDATION', 'BIT Mesra cannot be merged into another institute.');

  return db.transaction(async (tx) => {
    const [src] = await tx.select().from(institutions).where(eq(institutions.code, from)).limit(1);
    const [dst] = await tx.select().from(institutions).where(eq(institutions.code, into)).limit(1);
    if (!src || src.status === 'merged') throw new ServiceError('NOT_FOUND', 'That institute is not in the directory, or is already merged.');
    if (!dst || dst.status !== 'active') throw new ServiceError('VALIDATION', 'Merge into an approved institute: approve it first.');

    const text = institutionText(dst);
    const changed = new Set<string>();
    let keyClashes = 0;
    for (const f of institutionFields()) {
      const m = MODULES[f.moduleKey]!;
      const rows = await tx.select({ id: records.id, data: records.data, naturalKey: records.naturalKey, departmentId: records.departmentId })
        .from(records)
        .where(and(scopeFilter(actor, m), sql`${records.data} ->> ${f.codeKey} = ${from}`));
      for (const r of rows) {
        const data = { ...(r.data as Record<string, unknown>), [f.key]: text, [f.codeKey]: into };
        let naturalKey = r.naturalKey;
        if (m.naturalKey?.some((k) => k === f.key || k === f.codeKey)) {
          const next = buildNaturalKey(m, data, r.departmentId);
          if (next !== r.naturalKey) {
            const clash = next ? await tx.select({ id: records.id }).from(records)
              .where(and(eq(records.moduleKey, m.key), eq(records.naturalKey, next), ne(records.id, r.id), sql`${records.deletedAt} is null`)).limit(1) : [];
            if (clash.length > 0) keyClashes += 1; else naturalKey = next;
          }
        }
        await tx.update(records).set({ data, naturalKey, searchText: buildSearchText(m, data) }).where(eq(records.id, r.id));
        changed.add(r.id);
      }
    }
    await tx.update(institutions).set({ status: 'merged', mergedInto: into }).where(eq(institutions.code, from));
    return { records: changed.size, keyClashes };
  });
}
