import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { journalMetrics, journalIndexListings, lookupCache } from '@/server/db/schema';
import { getList } from '@/server/records/masterLists';
import { normIssn, type JournalListRow } from '@darp/shared/journals';

export { normIssn };

export function formatIssn(v: string): string {
  return `${v.slice(0, 4)}-${v.slice(4)}`;
}

/** Quartile and indexing for a journal (decisions D5 and D6). */
export async function journalFacts(
  issns: string[], year: number | null,
): Promise<{ quartile: string; indexing: string; flags: string[] }> {
  const keys = [...new Set(issns.map(normIssn).filter((x): x is string => x !== null))];
  if (keys.length === 0) return { quartile: '', indexing: '', flags: ['no-issn'] };

  const [{ n: sjrRows } = { n: 0 }] = await db.select({ n: count() }).from(journalMetrics);
  const [{ n: listRows } = { n: 0 }] = await db.select({ n: count() }).from(journalIndexListings);
  // Nothing loaded yet: say so, rather than claim the journal is unindexed.
  if (sjrRows === 0 && listRows === 0) return { quartile: '', indexing: '', flags: ['no-journal-lists'] };

  const flags: string[] = [];
  const metrics = await db.select().from(journalMetrics).where(inArray(journalMetrics.issn, keys));

  let quartile = '';
  if (sjrRows === 0) {
    flags.push('no-sjr-data');
  } else if (metrics.length === 0) {
    quartile = 'Not ranked in SJR';
  } else {
    const target = year ?? Math.max(...metrics.map((m) => m.year));
    const notAfter = metrics.filter((m) => m.year <= target).sort((a, b) => b.year - a.year)[0];
    const best = notAfter ?? [...metrics].sort((a, b) => a.year - b.year)[0]!;
    quartile = best.quartile ? `${best.quartile} (SJR ${best.year})` : `Not ranked in SJR ${best.year}`;
  }

  const listings = await db.select({ listName: journalIndexListings.listName })
    .from(journalIndexListings).where(inArray(journalIndexListings.issn, keys));
  const inLists = new Set(listings.map((l) => l.listName));
  if (metrics.length > 0) inLists.add('Scopus');   // SJR is computed from Scopus
  const order = await getList('indexingTypes');    // IQAC's order is the priority order
  const indexing = order.find((name) => inLists.has(name)) ?? '';
  if (!indexing) flags.push('not-indexed');

  return { quartile, indexing, flags };
}

/* ───────────── loading the lists (admin screen and command-line import) ───────────── */

/** Quartile and indexing are cached with each DOI; forget them so the next lookup uses the new lists. */
async function forgetCachedDois() {
  await db.delete(lookupCache).where(eq(lookupCache.kind, 'doi'));
}

/** One batch of an SJR edition. Re-importing a year overwrites it. */
export async function storeSjrRows(year: number, rows: JournalListRow[]): Promise<number> {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => ({
      issn: r.issn, year, title: r.title, sourceType: r.sourceType ?? '', quartile: r.quartile ?? null,
    }));
    await db.insert(journalMetrics).values(batch).onConflictDoUpdate({
      target: [journalMetrics.issn, journalMetrics.year],
      set: { quartile: sql`excluded.quartile`, title: sql`excluded.title`, sourceType: sql`excluded.source_type` },
    });
  }
  await forgetCachedDois();
  return rows.length;
}

/** One batch of an index list (SCIE, SSCI, …) for a year. */
export async function storeListRows(listName: string, year: number, rows: JournalListRow[]): Promise<number> {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => ({ issn: r.issn, listName, year, title: r.title }));
    await db.insert(journalIndexListings).values(batch).onConflictDoNothing();
  }
  await forgetCachedDois();
  return rows.length;
}

/** Removes one loaded list, e.g. a file imported under the wrong year. */
export async function clearJournalList(kind: 'sjr' | 'list', year: number, listName?: string) {
  if (kind === 'sjr') {
    await db.delete(journalMetrics).where(eq(journalMetrics.year, year));
  } else {
    await db.delete(journalIndexListings)
      .where(and(eq(journalIndexListings.listName, listName ?? ''), eq(journalIndexListings.year, year)));
  }
  await forgetCachedDois();
}

export interface JournalListSummary {
  sjr: Array<{ year: number; issns: number; ranked: number }>;
  lists: Array<{ listName: string; year: number; issns: number }>;
}

export async function journalListSummary(): Promise<JournalListSummary> {
  const sjr = await db.select({
    year: journalMetrics.year,
    issns: count(),
    ranked: sql<number>`count(${journalMetrics.quartile})::int`,
  }).from(journalMetrics).groupBy(journalMetrics.year).orderBy(journalMetrics.year);
  const lists = await db.select({
    listName: journalIndexListings.listName, year: journalIndexListings.year, issns: count(),
  }).from(journalIndexListings)
    .groupBy(journalIndexListings.listName, journalIndexListings.year)
    .orderBy(journalIndexListings.listName, journalIndexListings.year);
  return { sjr, lists };
}
