import { count, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { journalMetrics, journalIndexListings } from '@/server/db/schema';
import { getList } from '@/server/records/masterLists';

/** '0167-739x' / '0167739X' → '0167739X'; anything else → null. */
export function normIssn(s: string): string | null {
  const v = s.replace(/[^0-9xX]/g, '').toUpperCase();
  return /^\d{7}[\dX]$/.test(v) ? v : null;
}

export function formatIssn(v: string): string {
  return `${v.slice(0, 4)}-${v.slice(4)}`;
}

/** Quartile and indexing for a journal (decisions D5 and D6). */
export async function journalFacts(
  issns: string[], year: number | null,
): Promise<{ quartile: string; indexing: string; flags: string[] }> {
  const keys = [...new Set(issns.map(normIssn).filter((x): x is string => x !== null))];
  const flags: string[] = [];
  if (keys.length === 0) return { quartile: '', indexing: '', flags: ['no-issn'] };

  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(journalMetrics);
  const metrics = await db.select().from(journalMetrics).where(inArray(journalMetrics.issn, keys));

  let quartile = '';
  if (n === 0) {
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
