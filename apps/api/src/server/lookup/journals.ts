import { and, count, eq, max, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { journalMetrics, journalIndexListings, journalCoverage, journalJcr, journalJcrTitles } from '@/server/db/schema';
import { normIssn, parseCoverage, journalTitleKey, type JournalListRow, type JcrRow } from '@darp/shared/journals';

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

/*
 * A paper's indexing, quartile and Impact Factor are not stored with it: server/journals/ranking.ts
 * works them out from the ISSN whenever they are shown, so a newly loaded list counts at once.
 */

/* ───────────── loading the lists (admin screen and command-line import) ───────────── */

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
  return rows.length;
}

/** One batch of an index list (SCIE, SSCI, …) for a year. */
export async function storeListRows(listName: string, year: number, rows: JournalListRow[]): Promise<number> {
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => ({ issn: r.issn, listName, year, title: r.title }));
    await db.insert(journalIndexListings).values(batch).onConflictDoNothing();
  }
  return rows.length;
}

/** One batch of a Journal Citation Reports export. A journal already loaded for the year is updated. */
export async function storeJcrRows(jifYear: number, rows: JcrRow[]): Promise<number> {
  for (let i = 0; i < rows.length; i += 500) {
    // One row per ISSN in a statement: an upsert may not touch the same row twice.
    const batch = [...new Map(rows.slice(i, i + 500).map((r) => [r.issn, r])).values()].map((r) => ({
      issn: r.issn, jifYear, title: r.title, jif: r.jif, jifQuartile: r.jifQuartile,
      categories: r.categories, editions: r.editions,
    }));
    await db.insert(journalJcr).values(batch).onConflictDoUpdate({
      target: [journalJcr.issn, journalJcr.jifYear],
      // Several exports (one per category) may carry the same journal: keep its best quartile.
      set: {
        title: sql`excluded.title`,
        jif: sql`coalesce(excluded.jif, ${journalJcr.jif})`,
        jifQuartile: sql`least(excluded.jif_quartile, ${journalJcr.jifQuartile})`,
        categories: sql`case when ${journalJcr.categories} = '' then excluded.categories
          when position(excluded.categories in ${journalJcr.categories}) > 0 then ${journalJcr.categories}
          else left(${journalJcr.categories} || '; ' || excluded.categories, 500) end`,
        editions: sql`case when position(excluded.editions in ${journalJcr.editions}) > 0 then ${journalJcr.editions}
          else left(${journalJcr.editions} || '; ' || excluded.editions, 60) end`,
        importedAt: sql`now()`,
      },
    });
  }
  // Names too, so a paper with no usable ISSN is found by its journal's name.
  for (let i = 0; i < rows.length; i += 500) {
    const byKey = new Map<string, JcrRow>();
    for (const r of rows.slice(i, i + 500)) {
      const k = journalTitleKey(r.title);
      if (k && !byKey.has(k)) byKey.set(k, r);
    }
    if (byKey.size === 0) continue;
    await db.insert(journalJcrTitles).values([...byKey].map(([titleKey, r]) => ({
      titleKey, jifYear, title: r.title.slice(0, 500), jif: r.jif, jifQuartile: r.jifQuartile,
    }))).onConflictDoUpdate({
      target: [journalJcrTitles.titleKey, journalJcrTitles.jifYear],
      set: {
        title: sql`excluded.title`,
        jif: sql`coalesce(excluded.jif, ${journalJcrTitles.jif})`,
        jifQuartile: sql`least(excluded.jif_quartile, ${journalJcrTitles.jifQuartile})`,
        importedAt: sql`now()`,
      },
    });
  }
  return rows.length;
}

/** Removes one loaded list, e.g. a file imported under the wrong year. */
export async function clearJournalList(kind: 'sjr' | 'list' | 'jcr', year: number, listName?: string) {
  if (kind === 'jcr') {
    await db.delete(journalJcr).where(eq(journalJcr.jifYear, year));
    await db.delete(journalJcrTitles).where(eq(journalJcrTitles.jifYear, year));
  } else if (kind === 'sjr') {
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
}

export interface JournalListSummary {
  /** source 'scimago' = loaded by IQAC; 'scopus-list' = computed automatically. */
  sjr: Array<{ year: number; source: string; issns: number; ranked: number; importedAt: Date | null }>;
  /** source 'upload' = loaded by IQAC; 'scopus-list' = fetched automatically. */
  lists: Array<{ listName: string; year: number; source: string; issns: number; importedAt: Date | null }>;
  /** Journal Citation Reports exports, one entry per JIF year. */
  jcr: Array<{ jifYear: number; issns: number; withJif: number; journals: number; importedAt: Date | null }>;
}

export async function journalListSummary(): Promise<JournalListSummary> {
  const sjr = await db.select({
    year: journalMetrics.year,
    source: journalMetrics.source,
    issns: count(),
    ranked: sql<number>`count(${journalMetrics.quartile})::int`,
    importedAt: max(journalMetrics.importedAt),
  }).from(journalMetrics)
    .groupBy(journalMetrics.year, journalMetrics.source)
    .orderBy(journalMetrics.year, journalMetrics.source);
  const lists = await db.select({
    listName: journalIndexListings.listName, year: journalIndexListings.year,
    source: journalIndexListings.source, issns: count(), importedAt: max(journalIndexListings.importedAt),
  }).from(journalIndexListings)
    .groupBy(journalIndexListings.listName, journalIndexListings.year, journalIndexListings.source)
    .orderBy(journalIndexListings.listName, journalIndexListings.year);
  const jcr = await db.select({
    jifYear: journalJcr.jifYear, issns: count(), withJif: sql<number>`count(${journalJcr.jif})::int`,
    importedAt: max(journalJcr.importedAt),
  }).from(journalJcr).groupBy(journalJcr.jifYear).orderBy(journalJcr.jifYear);
  const named = await db.select({ jifYear: journalJcrTitles.jifYear, journals: count() }).from(journalJcrTitles).groupBy(journalJcrTitles.jifYear);
  return { sjr, lists, jcr: jcr.map((j) => ({ ...j, journals: named.find((n) => n.jifYear === j.jifYear)?.journals ?? 0 })) };
}
