import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { records, institutions } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { MODULES } from '@darp/shared/modules';
import { institutionText, normInstitution } from '@darp/shared/institutions';
import { buildNaturalKey, buildSearchText } from './prepare';
import { institutionFields } from './institutionMerge';
import { ServiceError } from './service';
import { scopeFilter } from './scope';

/*
 * Institute names typed before the directory existed ("IIT Delhi, Delhi, India") get their directory entry
 * when there is exactly one. Only an exact match is ever taken: the text, compared the way a search compares
 * names (case, accents, punctuation and "&" aside), must equal one entry's name or one of its other names.
 * Nothing is guessed: no match, or several, leaves the record as it is for its owner to choose when they
 * next submit it. A wrong institute is worse than an unmatched one.
 */

export type MatchState = 'matched' | 'none' | 'ambiguous';

export interface MatchLine {
  moduleKey: string;
  field: string;
  text: string;
  records: number;
  state: MatchState;
  /** The directory entry, when matched; the candidates, when ambiguous. */
  codes: string[];
}

export interface MatchReport {
  lines: MatchLine[];
  /** Records changed (0 on a dry run). */
  applied: number;
  keyClashes: number;
}

type Directory = Map<string, string[]>;

/** Every name and other name of the entries in use, as the way a search compares them → their codes. */
async function loadDirectory(): Promise<{ byName: Directory; entries: Map<string, { name: string; state: string | null; country: string }> }> {
  const rows = await db.select({ code: institutions.code, name: institutions.name, aliases: institutions.aliases, state: institutions.state, country: institutions.country })
    .from(institutions).where(ne(institutions.status, 'merged'));
  const byName: Directory = new Map();
  const entries = new Map<string, { name: string; state: string | null; country: string }>();
  for (const r of rows) {
    entries.set(r.code, { name: r.name, state: r.state, country: r.country });
    for (const n of new Set([r.name, ...r.aliases].map(normInstitution).filter(Boolean))) {
      const list = byName.get(n);
      if (list) list.push(r.code); else byName.set(n, [r.code]);
    }
  }
  return { byName, entries };
}

/**
 * The entry a typed text names, if exactly one. People typed "IIT Delhi, Delhi, India": the whole text is
 * tried first, then with its last comma-separated parts dropped (the place, the country), and the first
 * form that names any entry decides: one entry is a match, several are ambiguous, never a shorter guess.
 */
export function matchText(text: string, byName: Directory): { state: MatchState; codes: string[] } {
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  for (let k = parts.length; k >= 1; k -= 1) {
    const hit = byName.get(normInstitution(parts.slice(0, k).join(' ')));
    if (!hit || hit.length === 0) continue;
    return hit.length === 1 ? { state: 'matched', codes: hit } : { state: 'ambiguous', codes: hit.slice(0, 5) };
  }
  return { state: 'none', codes: [] };
}

/**
 * Finds the records whose institute was typed without a directory entry and, with `apply`, gives each the
 * entry it names. IQAC only (it reads every record of every module through each module's scopeFilter).
 * A record whose duplicate-guard key would clash keeps its old key and is counted, never failed.
 */
export async function matchOldInstitutes(actor: SessionUser, opts: { apply: boolean }): Promise<MatchReport> {
  if (actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 'Only IQAC may match institutes.');
  const { byName, entries } = await loadDirectory();
  const lines: MatchLine[] = [];
  const todo: Array<{ moduleKey: string; key: string; codeKey: string; text: string; code: string }> = [];

  for (const f of institutionFields()) {
    const m = MODULES[f.moduleKey]!;
    const text = sql<string>`${records.data} ->> ${f.key}`;
    const rows = await db.select({ text, n: sql<number>`count(*)::int` }).from(records)
      .where(and(
        scopeFilter(actor, m),
        sql`coalesce(${records.data} ->> ${f.codeKey}, '') = ''`,
        sql`coalesce(${records.data} ->> ${f.key}, '') <> ''`,
      ))
      .groupBy(sql`1`);
    for (const r of rows) {
      const found = matchText(r.text, byName);
      lines.push({ moduleKey: f.moduleKey, field: f.key, text: r.text, records: r.n, state: found.state, codes: found.codes });
      if (found.state === 'matched') todo.push({ moduleKey: f.moduleKey, key: f.key, codeKey: f.codeKey, text: r.text, code: found.codes[0]! });
    }
  }

  let applied = 0;
  let keyClashes = 0;
  if (opts.apply && todo.length > 0) {
    await db.transaction(async (tx) => {
      for (const t of todo) {
        const m = MODULES[t.moduleKey]!;
        const inst = entries.get(t.code)!;
        const shown = institutionText(inst);
        const rows = await tx.select({ id: records.id, data: records.data, naturalKey: records.naturalKey, departmentId: records.departmentId })
          .from(records)
          .where(and(scopeFilter(actor, m), sql`${records.data} ->> ${t.key} = ${t.text}`, sql`coalesce(${records.data} ->> ${t.codeKey}, '') = ''`));
        for (const r of rows) {
          const data = { ...(r.data as Record<string, unknown>), [t.key]: shown, [t.codeKey]: t.code };
          let naturalKey = r.naturalKey;
          if (m.naturalKey?.some((k) => k === t.key || k === t.codeKey)) {
            const next = buildNaturalKey(m, data, r.departmentId);
            if (next !== r.naturalKey) {
              const clash = next ? await tx.select({ id: records.id }).from(records)
                .where(and(eq(records.moduleKey, m.key), eq(records.naturalKey, next), ne(records.id, r.id), sql`${records.deletedAt} is null`)).limit(1) : [];
              if (clash.length > 0) keyClashes += 1; else naturalKey = next;
            }
          }
          await tx.update(records).set({ data, naturalKey, searchText: buildSearchText(m, data) }).where(eq(records.id, r.id));
          applied += 1;
        }
      }
    });
  }
  return { lines, applied, keyClashes };
}
