import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { records, profileBaselines } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import type { DeclaredRow, DeclaredSheet } from '@darp/shared/contracts';
import { ServiceError, mustGetModule } from '@/server/records/service';
import { scopeFilter } from '@/server/records/scope';
import {
  DECLARED_COUNTERS, COUNTED_STATUSES, declaredYearType, lastCompletedYear, type DeclaredDef,
} from './counters';

/*
 * The figures a person declares because DARP holds no records for them (seminars attended, papers
 * presented…). A figure about one year is kept for that year, so any finished year can be filled in and
 * IQAC's reports read the year they are about. It is saved under `<figure>@<year>`; a total since joining
 * keeps the plain figure key. Nothing is guessed: no answer is null, and 0 is an answer.
 */

const FIRST_YEAR = 1990;
const section = (c: DeclaredDef): DeclaredRow['section'] => {
  const t = declaredYearType(c);
  return t === 'AY' ? 'ay' : t === 'CY' ? 'cy' : 'since';
};
export const declaredKey = (c: DeclaredDef, year: number): string => (declaredYearType(c) ? `${c.key}@${year}` : c.key);

/** The years a person can fill in: from the year they joined to the last one that has ended, newest first. */
function yearsFrom(joining: string | null, last: number, stored: number[], type: 'AY' | 'CY'): number[] {
  const j = joining ? Number(joining.slice(0, 4)) : NaN;
  // A person who joined in January to June started in the academic year before the calendar year.
  const first = Number.isFinite(j) ? (type === 'AY' && Number(joining!.slice(5, 7)) < 7 ? j - 1 : j) : last - 9;
  const out = new Set<number>(stored.filter((y) => y >= FIRST_YEAR));
  for (let y = Math.max(first, FIRST_YEAR); y <= last; y += 1) out.add(y);
  return [...out].sort((a, b) => b - a);
}

/** The stored figures of one person, by the key they are saved under. */
async function storedFor(userId: string): Promise<Map<string, number>> {
  const rows = await db.select({ k: profileBaselines.counterKey, v: profileBaselines.value }).from(profileBaselines)
    .where(eq(profileBaselines.userId, userId));
  return new Map(rows.map((r) => [r.k, Number(r.v)]));
}

/**
 * The sheet for the signed-in person: every declared figure for the academic and the calendar year
 * chosen (the last that has ended, unless asked for another). With `counted`, each row also says what DARP
 * counts for the same thing from their records. Only the person's own sheet is read.
 */
export async function declaredSheet(
  actor: SessionUser, input: { ay?: number; cy?: number; counted?: boolean }, today = new Date(),
): Promise<DeclaredSheet> {
  const stored = await storedFor(actor.id);
  const yearsOf = (type: 'AY' | 'CY') => [...stored.keys()].flatMap((k) => {
    const m = /^(.+)@((?:19|20)\d{2})$/.exec(k);
    const c = m ? DECLARED_COUNTERS.find((d) => d.key === m[1]) : undefined;
    return m && c && declaredYearType(c) === type ? [Number(m[2])] : [];
  });
  const lastAY = lastCompletedYear('AY', today);
  const lastCY = lastCompletedYear('CY', today);
  const joining = actor.dateOfJoining ? String(actor.dateOfJoining) : null;
  const years = { ay: yearsFrom(joining, lastAY, yearsOf('AY'), 'AY'), cy: yearsFrom(joining, lastCY, yearsOf('CY'), 'CY') };
  const ay = input.ay ?? lastAY;
  const cy = input.cy ?? lastCY;
  if (!years.ay.includes(ay) || !years.cy.includes(cy)) {
    throw new ServiceError('VALIDATION', 'Choose a year that has ended.', { year: 'That year is not one you can fill in.' });
  }

  const rows: DeclaredRow[] = DECLARED_COUNTERS.map((c) => {
    const s = section(c);
    const key = declaredKey(c, s === 'ay' ? ay : cy);
    return { key, label: c.short, help: c.help, format: c.format, section: s, value: stored.get(key) ?? null };
  });
  if (input.counted) await addCounted(actor, rows, ay, cy);
  return { ay, cy, years, rows };
}

/** What DARP counts from the person's own records for each row that has a source (see `countedFrom`). */
async function addCounted(actor: SessionUser, rows: DeclaredRow[], ay: number, cy: number) {
  const modules = [...new Set(DECLARED_COUNTERS.flatMap((c) => (c.countedFrom ? [c.countedFrom.moduleKey] : [])))];
  const mine = await Promise.all(modules.map(async (moduleKey) => {
    const m = mustGetModule(moduleKey);
    const found = await db.select({ data: records.data, ayYear: records.ayYear, cyYear: records.cyYear }).from(records)
      .where(and(
        scopeFilter(actor, m), eq(records.ownerUserId, actor.id), inArray(records.status, COUNTED_STATUSES), isNull(records.deletedAt),
      ));
    return [moduleKey, found] as const;
  }));
  const byModule = new Map(mine);
  DECLARED_COUNTERS.forEach((c, i) => {
    const row = rows[i]!;
    const from = c.countedFrom;
    if (!from) { row.counted = { value: null, note: 'DARP has no records for this.', moduleKey: null }; return; }
    const found = (byModule.get(from.moduleKey) ?? []).filter((r) => {
      const data = r.data as Record<string, unknown>;
      if (!Object.entries(from.where ?? {}).every(([k, allowed]) => allowed.includes(String(data[k] ?? '')))) return false;
      // A record dated only by year has no year of the other type, as in the reports: it is not counted there.
      return row.section === 'since' || (row.section === 'ay' ? r.ayYear === ay : r.cyYear === cy);
    });
    row.counted = { value: found.length, note: from.note, moduleKey: from.moduleKey };
  });
}

export interface DeclaredChange { key: string; before: number | null; after: number | null }

/**
 * Saves the figures changed on the sheet in one go: all, or none when one is not allowed. A figure about
 * one year must name a year that has ended. null takes an answer back. Returns what changed, for the audit.
 */
export async function saveDeclared(
  actor: SessionUser, items: Array<{ counterKey: string; value: number | null }>, today = new Date(),
): Promise<DeclaredChange[]> {
  const errors: Record<string, string> = {};
  const checked = items.map((it) => {
    const m = /^(.+?)(?:@((?:19|20)\d{2}))?$/.exec(it.counterKey);
    const c = m ? DECLARED_COUNTERS.find((d) => d.key === m[1]) : undefined;
    const type = c ? declaredYearType(c) : null;
    const year = m?.[2] ? Number(m[2]) : null;
    const bad = (msg: string) => { errors[it.counterKey] = msg; };
    if (!c) bad('That is not a figure you can enter.');
    else if (type && (year === null || year < FIRST_YEAR || year > lastCompletedYear(type, today))) bad('Choose a year that has ended.');
    else if (!type && year !== null) bad('That figure is not about one year.');
    else if (it.value !== null && (!Number.isInteger(it.value) || it.value < 0 || it.value > 1_000_000_000_000)) bad('Enter a whole number of zero or more.');
    else if (it.value !== null && c!.format === 'yesno' && it.value > 1) bad('Answer Yes or No.');
    return it;
  });
  if (Object.keys(errors).length > 0) throw new ServiceError('VALIDATION', 'Check the figures.', errors);

  const before = await storedFor(actor.id);
  const changes = checked.map((it) => ({ key: it.counterKey, before: before.get(it.counterKey) ?? null, after: it.value }))
    .filter((c) => c.before !== c.after);
  await db.transaction(async (tx) => {
    for (const c of changes) {
      if (c.after === null) {
        await tx.delete(profileBaselines).where(and(eq(profileBaselines.userId, actor.id), eq(profileBaselines.counterKey, c.key)));
      } else {
        await tx.insert(profileBaselines).values({ userId: actor.id, counterKey: c.key, value: c.after, setBy: actor.id })
          .onConflictDoUpdate({
            target: [profileBaselines.userId, profileBaselines.counterKey],
            set: { value: c.after, setBy: actor.id, updatedAt: new Date() },
          });
      }
    }
  });
  return changes;
}
