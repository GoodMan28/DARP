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
): Promise<{ quartile: string; quartileSource: string; indexing: string; flags: string[] }> {
  const keys = [...new Set(issns.map(normIssn).filter((x): x is string => x !== null))];
  if (keys.length === 0) return { quartile: '', quartileSource: '', indexing: '', flags: ['no-issn'] };

  const [{ n: sjrRows } = { n: 0 }] = await db.select({ n: count() }).from(journalMetrics);
  const [{ n: listRows } = { n: 0 }] = await db.select({ n: count() }).from(journalIndexListings);
  // Nothing loaded yet: say so, rather than claim the journal is unindexed.
  if (sjrRows === 0 && listRows === 0) return { quartile: '', quartileSource: '', indexing: '', flags: ['no-journal-lists'] };

  const flags: string[] = [];
  const metrics = await db.select().from(journalMetrics).where(inArray(journalMetrics.issn, keys));

  // An empty quartile means "not found": the form then lets the owner choose it (with evidence).
  let quartile = '';
  let quartileSource = '';
  if (sjrRows === 0) {
    flags.push('no-sjr-data');
  } else if (metrics.length > 0) {
    const target = year ?? Math.max(...metrics.map((m) => m.year));
    const notAfter = metrics.filter((m) => m.year <= target).sort((a, b) => b.year - a.year)[0];
    const best = notAfter ?? [...metrics].sort((a, b) => a.year - b.year)[0]!;
    quartile = best.quartile ?? 'Not ranked';
    // A quartile computed from Elsevier's list says so; SCImago's own file needs no note.
    quartileSource = `SJR ${best.year}${best.source === 'scopus-list' ? ' · Scopus list' : ' · SCImago'}`;
  }

  const listings = await db.select({ listName: journalIndexListings.listName })
    .from(journalIndexListings).where(inArray(journalIndexListings.issn, keys));
  const inLists = new Set(listings.map((l) => l.listName));
  if (metrics.length > 0) inLists.add('Scopus');   // SJR is computed from Scopus
  const order = await getList('indexingTypes');    // IQAC's order is the priority order
  const indexing = order.find((name) => inLists.has(name)) ?? '';
  if (!indexing) flags.push('not-indexed');

  return { quartile, quartileSource, indexing, flags };
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
      source: 'scimago',
    }));
    await db.insert(journalMetrics).values(batch).onConflictDoUpdate({
      target: [journalMetrics.issn, journalMetrics.year],
      // SCImago's own figures replace a quartile computed from the Scopus list.
      set: {
        quartile: sql`excluded.quartile`, title: sql`excluded.title`,
        sourceType: sql`excluded.source_type`, source: sql`'scimago'`,
      },
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
    // Only what IQAC loaded; the automatic Scopus rows are replaced by the next sync instead.
    await db.delete(journalMetrics).where(and(eq(journalMetrics.year, year), eq(journalMetrics.source, 'scimago')));
  } else {
    await db.delete(journalIndexListings)
      .where(and(
        eq(journalIndexListings.listName, listName ?? ''), eq(journalIndexListings.year, year),
        eq(journalIndexListings.source, 'upload'),
      ));
  }
  await forgetCachedDois();
}

export interface JournalListSummary {
  /** source 'scimago' = loaded by IQAC; 'scopus-list' = computed automatically. */
  sjr: Array<{ year: number; source: string; issns: number; ranked: number }>;
  /** source 'upload' = loaded by IQAC; 'scopus-list' = fetched automatically. */
  lists: Array<{ listName: string; year: number; source: string; issns: number }>;
}

export async function journalListSummary(): Promise<JournalListSummary> {
  const sjr = await db.select({
    year: journalMetrics.year,
    source: journalMetrics.source,
    issns: count(),
    ranked: sql<number>`count(${journalMetrics.quartile})::int`,
  }).from(journalMetrics)
    .groupBy(journalMetrics.year, journalMetrics.source)
    .orderBy(journalMetrics.year, journalMetrics.source);
  const lists = await db.select({
    listName: journalIndexListings.listName, year: journalIndexListings.year,
    source: journalIndexListings.source, issns: count(),
  }).from(journalIndexListings)
    .groupBy(journalIndexListings.listName, journalIndexListings.year, journalIndexListings.source)
    .orderBy(journalIndexListings.listName, journalIndexListings.year);
  return { sjr, lists };
}
