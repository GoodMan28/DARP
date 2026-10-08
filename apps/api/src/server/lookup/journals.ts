import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { journalMetrics, journalIndexListings, journalCoverage, lookupCache } from '@/server/db/schema';
import { getList } from '@/server/records/masterLists';
import { normIssn, parseCoverage, type JournalListRow } from '@darp/shared/journals';

export { normIssn };

export function formatIssn(v: string): string {
  return `${v.slice(0, 4)}-${v.slice(4)}`;
}

type CoverageRow = { source: string; fromYear: number; toYear: number | null };

/** "2016–2017 and 2019 onwards" — the ranges as a phrase for a reason shown to people. */
function describeRanges(rows: CoverageRow[]): string {
  // A journal's print and online ISSNs (and both lists) repeat the same ranges: say each once.
  const parts = [...new Set([...rows].sort((a, b) => a.fromYear - b.fromYear).map((r) => (
    r.toYear === null ? `${r.fromYear} onwards` : r.toYear === r.fromYear ? String(r.fromYear) : `${r.fromYear}–${r.toYear}`
  )))];
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Did Scopus cover the journal in this year? 'unknown' when no coverage is loaded for it.
 * A title Scopus dropped is not covered after its final year, whatever other lists say; otherwise
 * the year must fall inside one of the ranges. The flag explains a 'no' to the owner and DRIE.
 */
export function scopusCovered(
  rows: CoverageRow[], year: number | null,
): { covered: boolean | 'unknown'; flag: string | null } {
  if (rows.length === 0) return { covered: 'unknown', flag: null };
  const finals = rows.filter((r) => r.source === 'scopus-discontinued').map((r) => r.toYear ?? 0);
  const ranges = rows.filter((r) => r.source !== 'scopus-discontinued');
  const finalYear = finals.length > 0 ? Math.max(...finals) : null;
  if (year === null) return { covered: finalYear === null && ranges.some((r) => r.toYear === null), flag: null };
  if (finalYear !== null && year > finalYear) return { covered: false, flag: `scopus-dropped:${finalYear}` };
  if (ranges.some((r) => r.fromYear <= year && (r.toYear === null || year <= r.toYear))) return { covered: true, flag: null };
  if (ranges.length === 0) return { covered: true, flag: null };   // only the final year is known
  return { covered: false, flag: `scopus-not-that-year:${describeRanges(ranges)}` };
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
    // A quartile computed from Elsevier's list is an estimate, and says so; SCImago's is official.
    quartileSource = `SJR ${best.year}${best.source === 'scopus-list' ? ' · estimated (Scopus list)' : ' · SCImago'}`;
  }

  const coverageRows = await db.select({
    source: journalCoverage.source, fromYear: journalCoverage.fromYear, toYear: journalCoverage.toYear,
  }).from(journalCoverage).where(inArray(journalCoverage.issn, keys));
  const scopus = scopusCovered(coverageRows, year);
  if (scopus.flag) flags.push(scopus.flag);

  const listings = await db.select({ listName: journalIndexListings.listName })
    .from(journalIndexListings).where(inArray(journalIndexListings.issn, keys));
  const inLists = new Set(listings.map((l) => l.listName));
  // Scopus is decided by the years it covered the journal. Without coverage data, an SJR value
  // (which SCImago computes from Scopus) is the evidence, as before.
  if (scopus.covered === true || (scopus.covered === 'unknown' && metrics.length > 0)) inLists.add('Scopus');
  else inLists.delete('Scopus');
  // Not in Scopus that year: no SJR quartile for that year either.
  if (scopus.covered === false && year !== null) {
    quartile = 'Not ranked';
    quartileSource = `Not in Scopus in ${year}`;
  }
  const order = await getList('indexingTypes');    // IQAC's order is the priority order
  const indexing = order.find((name) => inLists.has(name)) ?? '';
  // A coverage flag already says why it is not Scopus; 'not-indexed' would only repeat it vaguely.
  if (!indexing && !scopus.flag) flags.push('not-indexed');

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
    const coverage = rows.slice(i, i + 500).flatMap((r) => {
      const ranges = parseCoverage(r.coverage ?? '');
      // Ranked in this edition and covered up to its year (or later): still covered.
      const last = ranges[ranges.length - 1];
      if (last && last.to !== null && last.to >= year) last.to = null;
      return ranges.map((x) => ({ issn: r.issn, source: 'scimago', fromYear: x.from, toYear: x.to }));
    });
    // One row per key in a statement: an upsert may not touch the same row twice.
    const unique = [...new Map(coverage.map((c) => [`${c.issn}|${c.fromYear}`, c])).values()];
    if (unique.length > 0) {
      await db.insert(journalCoverage).values(unique).onConflictDoUpdate({
        target: [journalCoverage.issn, journalCoverage.source, journalCoverage.fromYear],
        set: { toYear: sql`excluded.to_year`, importedAt: sql`now()` },
      });
    }
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
    // The coverage years came with the SCImago files: drop them once no SCImago file is left.
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(journalMetrics).where(eq(journalMetrics.source, 'scimago'));
    if (n === 0) await db.delete(journalCoverage).where(eq(journalCoverage.source, 'scimago'));
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
