import { and, asc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '@/server/db';
import { institutions } from '@/server/db/schema';
import { HOME_INSTITUTE, normInstitution, type InstituteHit } from '@darp/shared/institutions';

/*
 * The institute directory: AISHE (India), ROR (the world) and entries users added. A search looks
 * through each institute's name, code and aliases ("B.I.T. Mesra" finds Birla Institute of
 * Technology, Mesra); every word typed has to be somewhere in them.
 */

export type Institution = typeof institutions.$inferSelect;

/** The code a search text is, when it is nothing but a code: "u-0202", "U 0202", "ror-028vtqb15", "darp 12". */
function codeOf(q: string): string | null {
  const t = q.trim().toUpperCase().replace(/[\s_]+/g, '').replace(/^([A-Z]+)-?/, '$1-');
  let m = t.match(/^([UCSR])-(\d{1,6})$/);
  if (m) return `${m[1]}-${m[2]}`;
  m = t.match(/^ROR-([0-9A-Z]{9})$/);
  if (m) return `ROR-${m[1]!.toLowerCase()}`;
  m = t.match(/^DARP-(\d{1,6})$/);
  return m ? `DARP-${m[1]!.padStart(6, '0')}` : null;
}

/** A word for a LIKE pattern: its own % and _ made plain, with ! as the escape character. */
const likeWord = (w: string) => `%${w.replace(/[!%_]/g, (c) => `!${c}`)}%`;

export const hitOf = (r: Institution): InstituteHit => ({
  code: r.code, name: r.name, city: r.city, state: r.state, country: r.country,
  scheme: r.scheme as InstituteHit['scheme'], pending: r.status === 'pending',
});

/**
 * Up to `limit` institutes matching what was typed: Indian ones first, then those that start with
 * it, entries not yet reviewed last. `excludeHome` leaves out BIT Mesra itself.
 */
export async function searchInstitutes(
  q: string, opts: { excludeHome?: boolean; limit?: number } = {},
): Promise<InstituteHit[]> {
  // A code typed whole (U-0202, ROR-028vtqb15) is looked up as a code, not as words.
  const code = codeOf(q);
  if (code) {
    const [row] = await db.select().from(institutions).where(and(eq(institutions.code, code), ne(institutions.status, 'merged'))).limit(1);
    if (row && !(opts.excludeHome && row.code === HOME_INSTITUTE)) return [hitOf(row)];
  }
  const norm = normInstitution(q);
  const words = norm.split(' ').filter((w) => w.length >= 2);
  if (words.length === 0) return [];
  const where: SQL[] = [
    ne(institutions.status, 'merged'),
    ...words.map((w) => sql`${institutions.searchText} like ${likeWord(w)} escape '!'`),
  ];
  if (opts.excludeHome) where.push(ne(institutions.code, HOME_INSTITUTE));
  const startsWith = `${norm.replace(/[!%_]/g, (c) => `!${c}`)}%`;
  const rows = await db.select().from(institutions)
    .where(and(...where))
    .orderBy(
      sql`case when ${institutions.searchText} like ${startsWith} escape '!' then 0 else 1 end`,
      sql`case when ${institutions.countryCode} = 'IN' then 0 else 1 end`,
      sql`case when ${institutions.status} = 'pending' then 1 else 0 end`,
      sql`length(${institutions.name})`,
      asc(institutions.name),
    )
    .limit(Math.min(Math.max(opts.limit ?? 20, 1), 50));
  return rows.map(hitOf);
}

/**
 * The institutes behind some codes, keyed by the code asked for. One merged into another is the
 * institute it was merged into.
 */
export async function institutesByCode(codes: string[]): Promise<Map<string, Institution>> {
  const out = new Map<string, Institution>();
  const wanted = [...new Set(codes.filter(Boolean))];
  if (wanted.length === 0) return out;
  let rows = await db.select().from(institutions).where(inArray(institutions.code, wanted));
  const byCode = new Map(rows.map((r) => [r.code, r]));
  // Follow a merge to the entry it points to (a few hops at most).
  for (let hop = 0; hop < 3; hop += 1) {
    const next = [...byCode.values()].filter((r) => r.status === 'merged' && r.mergedInto && !byCode.has(r.mergedInto)).map((r) => r.mergedInto!);
    if (next.length === 0) break;
    rows = await db.select().from(institutions).where(inArray(institutions.code, next));
    for (const r of rows) byCode.set(r.code, r);
  }
  for (const code of wanted) {
    let r = byCode.get(code);
    for (let hop = 0; r && r.status === 'merged' && r.mergedInto && hop < 3; hop += 1) r = byCode.get(r.mergedInto);
    if (r && r.status !== 'merged') out.set(code, r);
  }
  return out;
}

export async function institutionCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(institutions).where(eq(institutions.status, 'active'));
  return row?.n ?? 0;
}
