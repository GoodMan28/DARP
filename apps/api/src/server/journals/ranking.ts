import { spanColumnText } from '@darp/shared/projectPeriod';
import { inArray, max } from 'drizzle-orm';
import { db } from '@/server/db';
import { journalMetrics, journalIndexListings, journalCoverage, journalJcr } from '@/server/db/schema';
import { getList } from '@/server/records/masterLists';
import { scopusCovered } from '@/server/lookup/journals';
import { normIssn, rankingTexts, type JournalRanking } from '@darp/shared/journals';
import type { ModuleConfig } from '@darp/shared/modules/types';

/*
 * A journal's indexing, quartile and Impact Factor, worked out from its ISSN whenever they are shown
 * (form, record page, lists, exports, counters) — never stored with a paper, so a list IQAC loads
 * today counts for every paper at once. Always the latest edition loaded:
 *  - SJR quartile: the newest SJR year (SCImago's own file, or estimated from Elsevier's list);
 *    none when Scopus did not cover the journal in the paper's year.
 *  - Impact Factor and JIF quartile: the newest Journal Citation Reports year.
 *  - Indexes: Scopus when it covered the journal in the paper's year; every other list (SCIE, SSCI,
 *    AHCI, ESCI) when the journal is in that list's newest upload. In IQAC's Indexing order.
 * Anything not found is null, shown as "NA".
 */

export interface RankingItem {
  /** The caller's own key for the item (a record id, a row number). */
  key: string;
  issns: string[];
  /** The paper's year: decides whether Scopus covered the journal. */
  year: number | null;
}

const empty = (): JournalRanking => ({
  indexes: [], sjrQuartile: null, sjrYear: null, sjrEstimated: false, jif: null, jifQuartile: null, jifYear: null,
});

const issnsOf = (issns: string[]) => [...new Set(issns.map(normIssn).filter((x): x is string => x !== null))];

/** Rankings for many papers at once: a handful of queries in all, not a handful per paper. */
export async function rankingsFor(items: RankingItem[]): Promise<Map<string, JournalRanking>> {
  const out = new Map<string, JournalRanking>();
  const all = [...new Set(items.flatMap((i) => issnsOf(i.issns)))];
  if (all.length === 0) {
    for (const i of items) out.set(i.key, empty());
    return out;
  }

  const [metrics, listings, coverage, jcr, newestLists, order] = await Promise.all([
    db.select({
      issn: journalMetrics.issn, year: journalMetrics.year, quartile: journalMetrics.quartile, source: journalMetrics.source,
    }).from(journalMetrics).where(inArray(journalMetrics.issn, all)),
    db.select({ issn: journalIndexListings.issn, listName: journalIndexListings.listName, year: journalIndexListings.year })
      .from(journalIndexListings).where(inArray(journalIndexListings.issn, all)),
    db.select({
      issn: journalCoverage.issn, source: journalCoverage.source, fromYear: journalCoverage.fromYear, toYear: journalCoverage.toYear,
    }).from(journalCoverage).where(inArray(journalCoverage.issn, all)),
    db.select({
      issn: journalJcr.issn, jifYear: journalJcr.jifYear, jif: journalJcr.jif, jifQuartile: journalJcr.jifQuartile,
    }).from(journalJcr).where(inArray(journalJcr.issn, all)),
    // A journal dropped from the newest SCIE list is no longer SCIE, whatever older lists said.
    db.select({ listName: journalIndexListings.listName, year: max(journalIndexListings.year) })
      .from(journalIndexListings).groupBy(journalIndexListings.listName),
    getList('indexingTypes'),
  ]);
  const newestYear = new Map(newestLists.map((l) => [l.listName, l.year]));
  const rank = (name: string) => { const i = order.indexOf(name); return i < 0 ? order.length : i; };

  for (const item of items) {
    const keys = new Set(issnsOf(item.issns));
    if (keys.size === 0) { out.set(item.key, empty()); continue; }
    const r = empty();
    const mine = <T extends { issn: string }>(rows: T[]) => rows.filter((x) => keys.has(x.issn));

    const sjr = mine(metrics);
    const scopus = scopusCovered(mine(coverage), item.year);
    const inScopus = scopus.covered === true
      || (scopus.covered === 'unknown' && (sjr.length > 0 || mine(listings).some((l) => l.listName === 'Scopus')));

    // Newest edition; at the same year SCImago's own figure beats one estimated from Elsevier's list.
    const latest = [...sjr].sort((a, b) => b.year - a.year || (a.source === 'scimago' ? -1 : 1))[0];
    if (latest && scopus.covered !== false && latest.quartile) {
      r.sjrQuartile = latest.quartile;
      r.sjrYear = latest.year;
      r.sjrEstimated = latest.source !== 'scimago';
    }

    const wos = [...mine(jcr)].sort((a, b) => b.jifYear - a.jifYear)[0];
    if (wos && (wos.jif || wos.jifQuartile)) {
      r.jif = wos.jif;
      r.jifQuartile = wos.jifQuartile;
      r.jifYear = wos.jifYear;
    }

    const names = new Set<string>();
    if (inScopus) names.add('Scopus');
    for (const l of mine(listings)) {
      if (l.listName !== 'Scopus' && l.year === newestYear.get(l.listName)) names.add(l.listName);
    }
    r.indexes = [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    out.set(item.key, r);
  }
  return out;
}

export async function rankingFor(issns: string[], year: number | null): Promise<JournalRanking> {
  return (await rankingsFor([{ key: '0', issns, year }])).get('0') ?? empty();
}

/** The ISSNs and year a record's ranking is worked out from (a Publications record). */
export function rankingItemOf(key: string, data: Record<string, unknown>): RankingItem {
  const year = Number(data.year);
  return {
    key,
    issns: String(data.issn ?? '').split(/[,;\s]+/).filter(Boolean),
    year: Number.isInteger(year) && year > 0 ? year : null,
  };
}

/**
 * The module's derived columns (`ModuleConfig.derived`) for each record, as display text:
 * { indexes: 'Scopus, SCIE', sjrQuartile: 'Q1 (SJR 2024)', jif: '5.2 (JIF 2024)', … }.
 * An empty map for a module with none.
 */
export async function derivedValues(
  m: ModuleConfig, rows: Array<{ key: string; data: Record<string, unknown> }>,
): Promise<Map<string, Record<string, string>>> {
  const out = new Map<string, Record<string, string>>();
  if (!m.derived?.length || rows.length === 0) return out;
  // A grant's project period and an MoU's expiry come from the record's own dates; journal figures from the ISSN.
  const needsRanking = m.derived.some((d) => !['projectPeriod', 'validUntil'].includes(d.key));
  const rankings = needsRanking ? await rankingsFor(rows.map((r) => rankingItemOf(r.key, r.data))) : null;
  for (const r of rows) {
    const texts = rankingTexts(rankings?.get(r.key) ?? empty()) as Record<string, string>;
    out.set(r.key, Object.fromEntries(m.derived.map((d) => [
      d.key, d.key === 'projectPeriod' || d.key === 'validUntil' ? spanColumnText(m.key, r.data) : texts[d.key] ?? '',
    ])));
  }
  return out;
}
