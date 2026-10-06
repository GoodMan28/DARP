import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { journalMetrics, journalIndexListings, lookupCache } from '@/server/db/schema';
import { log } from '@/server/log';
import { normIssn } from '@darp/shared/journals';

/*
 * Elsevier publishes the Scopus source list as a public spreadsheet (no login) on this page. It says,
 * for every serial, whether it is active in Scopus or discontinued, its SJR value and its subject
 * categories (ASJC). From that the portal derives, with no human download:
 *   - indexing "Scopus" — journals active and not discontinued;
 *   - the quartile — SCImago's method: rank SJR within each subject category, take the best quartile.
 * SCImago's own file, when IQAC loads it, takes precedence over the computed quartile.
 */
export const SCOPUS_LIST_PAGE = 'https://www.elsevier.com/resources/scopus-titlelists';
const META_KEY = 'scopus-list';
const STALE_DAYS = 30;
const DOWNLOAD_TIMEOUT_MS = 180_000;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december'];

export interface ListLink { url: string; name: string; year: number; month: number }

/** The newest spreadsheet linked from the page, dated from its file name (…_202405_…, …November_2024…). */
export function pickNewestList(html: string): ListLink | null {
  const urls = [...html.matchAll(/href="((?:https:)?\/\/downloads\.ctfassets\.net\/[^"]+\.xlsx)"/gi)]
    .map((m) => (m[1]!.startsWith('//') ? `https:${m[1]}` : m[1]!));
  const dated = urls.map((url) => {
    const name = decodeURIComponent(url.split('/').pop() ?? '');
    const compact = name.match(/(20\d{2})[_-]?(0[1-9]|1[0-2])(?!\d)/);
    if (compact) return { url, name, year: Number(compact[1]), month: Number(compact[2]) };
    const words = name.toLowerCase().match(/(january|february|march|april|may|june|july|august|september|october|november|december)[_\s-]*(20\d{2})/);
    if (words) return { url, name, year: Number(words[2]), month: MONTHS.indexOf(words[1]!) + 1 };
    return null;
  }).filter((x): x is ListLink => x !== null);
  dated.sort((a, b) => b.year - a.year || b.month - a.month);
  return dated[0] ?? null;
}

export interface ScopusJournal {
  issns: string[];
  title: string;
  /** Active in Scopus and not discontinued for quality reasons. */
  indexed: boolean;
  sjr: number | null;
  asjc: string[];
  sourceType: string;
}

/**
 * SCImago's quartile: within each subject category, journals ranked by SJR; the top quarter is Q1.
 * A journal in several categories gets its best quartile. Journals without an SJR value get none.
 */
export function bestQuartiles(journals: ScopusJournal[]): Array<'Q1' | 'Q2' | 'Q3' | 'Q4' | null> {
  const best: Array<number | null> = journals.map(() => null);
  const byCategory = new Map<string, number[]>();
  journals.forEach((j, i) => {
    if (j.sjr === null || !(j.sjr > 0)) return;
    for (const c of j.asjc) {
      const list = byCategory.get(c) ?? [];
      list.push(i);
      byCategory.set(c, list);
    }
  });
  for (const members of byCategory.values()) {
    members.sort((a, b) => journals[b]!.sjr! - journals[a]!.sjr!);
    const n = members.length;
    members.forEach((idx, rank) => {
      const q = Math.min(4, Math.floor((rank / n) * 4) + 1);
      if (best[idx] === null || q < best[idx]!) best[idx] = q;
    });
  }
  return best.map((q) => (q === null ? null : (`Q${q}` as 'Q1' | 'Q2' | 'Q3' | 'Q4')));
}

/** Cell → plain text, whatever ExcelJS hands back (rich text, hyperlink, formula, number). */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as { richText?: Array<{ text: string }>; text?: unknown; result?: unknown };
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.text !== undefined) return cellText(o.text);
    if (o.result !== undefined) return cellText(o.result);
    return '';
  }
  return String(v);
}

interface Columns { title: number; issn: number; eissn: number; active: number; discontinued: number; sjr: number; asjc: number; type: number; sjrYear: number }

/** The main sheet is the first whose header has a source title, an ISSN and an "<year> SJR" column. */
function columnsOf(header: string[]): Columns | null {
  const find = (re: RegExp) => header.findIndex((h) => re.test(h.trim()));
  const sjr = find(/^\d{4}\s*SJR$/i);
  const cols = {
    title: find(/^source\s*title/i),
    issn: find(/^(print[\s-]*)?issn$/i),
    eissn: find(/^e[\s-]*issn$/i),
    active: find(/^active/i),
    discontinued: find(/discontinued/i),
    sjr,
    asjc: find(/ASJC/i),
    type: find(/^source\s*type$/i),
    sjrYear: sjr >= 0 ? Number(header[sjr]!.trim().slice(0, 4)) : 0,
  };
  return cols.title >= 0 && cols.issn >= 0 && cols.sjr >= 0 && cols.asjc >= 0 ? cols : null;
}

/** Streams the spreadsheet (25 MB) instead of loading it whole, to keep memory low. */
export async function readScopusList(bytes: Buffer): Promise<{ journals: ScopusJournal[]; sjrYear: number }> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(bytes), {
    sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'ignore', worksheets: 'emit', entries: 'emit',
  });
  const journals: ScopusJournal[] = [];
  let sjrYear = 0;
  let done = false;

  for await (const sheet of reader) {
    let cols: Columns | null = null;
    let first = true;
    for await (const row of sheet) {
      if (done) continue;                                   // drain later sheets without reading them
      // row.values is sparse (empty cells are holes) and 1-based: Array.from fills the holes.
      const values = Array.from(row.values as unknown[], (v) => cellText(v)).slice(1);
      if (first) { first = false; cols = columnsOf(values); if (cols) sjrYear = cols.sjrYear; continue; }
      if (!cols) continue;
      const issns = [values[cols.issn], cols.eissn >= 0 ? values[cols.eissn] : '']
        .map((s) => normIssn(s ?? '')).filter((x): x is string => x !== null);
      if (issns.length === 0) continue;
      const sjrText = (values[cols.sjr] ?? '').replace(',', '.').trim();
      const sjr = sjrText === '' || Number.isNaN(Number(sjrText)) ? null : Number(sjrText);
      const active = cols.active < 0 || /^active/i.test(values[cols.active] ?? '');
      const discontinued = cols.discontinued >= 0 && (values[cols.discontinued] ?? '').trim() !== '';
      journals.push({
        issns: [...new Set(issns)],
        title: (values[cols.title] ?? '').trim().slice(0, 500),
        indexed: active && !discontinued,
        sjr,
        asjc: (values[cols.asjc] ?? '').split(/[;,\s]+/).filter((c) => /^\d{4}$/.test(c)),
        sourceType: cols.type >= 0 ? (values[cols.type] ?? '').trim().toLowerCase().slice(0, 60) : '',
      });
    }
    if (cols) done = true;
  }
  if (journals.length === 0) throw new Error('No journal sheet with Source Title, ISSN, SJR and ASJC columns was found.');
  return { journals, sjrYear };
}

export interface ScopusListStatus {
  file: string;
  listYear: number;
  listMonth: number;
  sjrYear: number;
  journals: number;
  indexed: number;
  ranked: number;
  fetchedAt: string;
}

export async function scopusListStatus(): Promise<ScopusListStatus | null> {
  const [row] = await db.select().from(lookupCache)
    .where(and(eq(lookupCache.kind, 'meta'), eq(lookupCache.lookupKey, META_KEY))).limit(1);
  return row ? (row.result as unknown as ScopusListStatus) : null;
}

let running: Promise<ScopusListStatus> | null = null;

/** Downloads the newest list and replaces the automatic rows. One run at a time. */
export function syncScopusList(): Promise<ScopusListStatus> {
  if (!running) running = doSync().finally(() => { running = null; });
  return running;
}

async function doSync(): Promise<ScopusListStatus> {
  if (process.env.LOOKUP_OFFLINE === '1') throw new Error('Lookups are switched off (LOOKUP_OFFLINE=1).');
  const page = await fetch(SCOPUS_LIST_PAGE, {
    headers: { 'user-agent': 'Mozilla/5.0 (DARP, BIT Mesra accreditation portal)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!page.ok) throw new Error(`The Elsevier title-list page answered HTTP ${page.status}.`);
  const link = pickNewestList(await page.text());
  if (!link) throw new Error('No Scopus title list was found on the Elsevier page.');

  const file = await fetch(link.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!file.ok) throw new Error(`Downloading ${link.name} failed: HTTP ${file.status}.`);
  const { journals, sjrYear } = await readScopusList(Buffer.from(await file.arrayBuffer()));
  const quartiles = bestQuartiles(journals);

  const listings: Array<typeof journalIndexListings.$inferInsert> = [];
  const metrics: Array<typeof journalMetrics.$inferInsert> = [];
  journals.forEach((j, i) => {
    for (const issn of j.issns) {
      if (j.indexed) listings.push({ issn, listName: 'Scopus', year: link.year, title: j.title, source: 'scopus-list' });
      if (j.sjr !== null && sjrYear > 0) {
        metrics.push({
          issn, year: sjrYear, title: j.title, sourceType: j.sourceType || 'journal',
          quartile: quartiles[i] ?? null, source: 'scopus-list',
        });
      }
    }
  });

  const status: ScopusListStatus = {
    file: link.name, listYear: link.year, listMonth: link.month, sjrYear,
    journals: journals.length,
    indexed: journals.filter((j) => j.indexed).length,
    ranked: quartiles.filter((q) => q !== null).length,
    fetchedAt: new Date().toISOString(),
  };

  await db.transaction(async (tx) => {
    await tx.delete(journalIndexListings).where(eq(journalIndexListings.source, 'scopus-list'));
    await tx.delete(journalMetrics).where(eq(journalMetrics.source, 'scopus-list'));
    for (let i = 0; i < listings.length; i += 1000) {
      await tx.insert(journalIndexListings).values(listings.slice(i, i + 1000)).onConflictDoNothing();
    }
    // An official SCImago row for the same ISSN and year is kept: it wins over the computed one.
    for (let i = 0; i < metrics.length; i += 1000) {
      await tx.insert(journalMetrics).values(metrics.slice(i, i + 1000)).onConflictDoNothing();
    }
    await tx.delete(lookupCache).where(eq(lookupCache.kind, 'doi'));
    await tx.insert(lookupCache)
      .values({ kind: 'meta', lookupKey: META_KEY, found: true, result: status, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: [lookupCache.kind, lookupCache.lookupKey],
        set: { result: status, fetchedAt: new Date() },
      });
  });

  log.info('scopus list synced', { ...status });
  return status;
}

/** Called at start-up: fetch when nothing is loaded yet or the copy is over a month old. Never throws. */
export async function syncScopusListIfStale(): Promise<void> {
  try {
    if (process.env.LOOKUP_OFFLINE === '1') return;
    const status = await scopusListStatus();
    const ageDays = status ? (Date.now() - Date.parse(status.fetchedAt)) / 86_400_000 : Infinity;
    if (ageDays < STALE_DAYS) return;
    await syncScopusList();
  } catch (e) {
    log.warn('scopus list sync failed', { error: e instanceof Error ? e.message : String(e) });
  }
}
