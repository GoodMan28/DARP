import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { journalMetrics, journalIndexListings, journalCoverage, lookupCache } from '@/server/db/schema';
import { log } from '@/server/log';
import { normIssn, parseCoverage, type CoverageRange } from '@darp/shared/journals';

/*
 * Elsevier publishes the Scopus source list as a public spreadsheet (no login) on this page. It says,
 * for every serial Scopus covers, the years it covered it, its SJR value and its subject categories
 * (ASJC); a second sheet lists the titles Scopus dropped and the last year it covered each. From that
 * the portal derives, with no human download:
 *   - indexing "Scopus" — only for a paper whose year Scopus covered the journal;
 *   - the quartile — SCImago's method: rank SJR within each subject category, take the best quartile.
 *     The list carries SJR only for titles still in Scopus, so this is an estimate, and says so.
 * SCImago's own file, when IQAC loads it, takes precedence over the computed quartile.
 */
export const SCOPUS_LIST_PAGE = 'https://www.elsevier.com/resources/scopus-titlelists';
const META_KEY = 'scopus-list';
const STALE_DAYS = 30;
const DOWNLOAD_TIMEOUT_MS = 180_000;
/** Bump when the sync stores something new, so the next start-up fetches the list again. */
const FORMAT = 2;

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
  /** The years Scopus covered it. For an indexed title the latest range is open-ended. */
  coverage: CoverageRange[];
}

/** A title Scopus dropped, and the last year it covered. */
export interface DroppedJournal { issns: string[]; finalYear: number }

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

interface Columns {
  title: number; issn: number; eissn: number; active: number; discontinued: number; sjr: number;
  asjc: number; type: number; coverage: number; sjrYear: number;
}

const finder = (header: string[]) => (re: RegExp) => header.findIndex((h) => re.test(h.trim()));

/** The main sheet is the first whose header has a source title, an ISSN and an "<year> SJR" column. */
function columnsOf(header: string[]): Columns | null {
  const find = finder(header);
  const sjr = find(/^\d{4}\s*SJR$/i);
  const cols = {
    title: find(/^source\s*title/i),
    issn: find(/^(print[\s-]*)?issn$/i),
    eissn: find(/^e[\s-]*issn$/i),
    active: find(/^active/i),
    discontinued: find(/discontinued/i),
    sjr,
    asjc: find(/ASJC|Classification Codes/i),
    type: find(/^source\s*type$/i),
    coverage: find(/^coverage$/i),
    sjrYear: sjr >= 0 ? Number(header[sjr]!.trim().slice(0, 4)) : 0,
  };
  return cols.title >= 0 && cols.issn >= 0 && cols.sjr >= 0 && cols.asjc >= 0 ? cols : null;
}

/** The "discontinued titles" sheet: ISSN columns, a reason for re-evaluation, and the final Year. */
function droppedColumnsOf(header: string[]): { issns: number[]; year: number } | null {
  const find = finder(header);
  const year = find(/^year$/i);
  const reason = find(/^reason/i);
  const issns = header.map((h, i) => (/issn/i.test(h) ? i : -1)).filter((i) => i >= 0);
  return year >= 0 && reason >= 0 && issns.length > 0 ? { issns, year } : null;
}

/** Streams the spreadsheet (25 MB) instead of loading it whole, to keep memory low. */
export async function readScopusList(bytes: Buffer): Promise<{
  journals: ScopusJournal[]; dropped: DroppedJournal[]; sjrYear: number;
}> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(bytes), {
    sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'ignore', worksheets: 'emit', entries: 'emit',
  });
  const journals: ScopusJournal[] = [];
  const dropped: DroppedJournal[] = [];
  let sjrYear = 0;
  let haveMain = false;
  let haveDropped = false;

  for await (const sheet of reader) {
    let cols: Columns | null = null;
    let droppedCols: ReturnType<typeof droppedColumnsOf> = null;
    let rowNo = 0;
    for await (const row of sheet) {
      rowNo += 1;
      if (haveMain && haveDropped) continue;                // drain the remaining sheets unread
      // row.values is sparse (empty cells are holes) and 1-based: Array.from fills the holes.
      const values = Array.from(row.values as unknown[], (v) => cellText(v)).slice(1);

      // The header is the first row on the main sheet, the second on the discontinued sheet.
      if (!cols && !droppedCols) {
        if (rowNo > 3) continue;
        if (!haveMain) { cols = columnsOf(values); if (cols) { sjrYear = cols.sjrYear; continue; } }
        if (!haveDropped) droppedCols = droppedColumnsOf(values);
        continue;
      }

      if (droppedCols) {
        const finalYear = Number((values[droppedCols.year] ?? '').trim());
        const issns = [...new Set(droppedCols.issns.map((i) => normIssn(values[i] ?? '')).filter((x): x is string => x !== null))];
        if (issns.length > 0 && finalYear >= 1900 && finalYear <= 2100) dropped.push({ issns, finalYear });
        continue;
      }

      const c = cols!;
      const issns = [values[c.issn], c.eissn >= 0 ? values[c.eissn] : '']
        .map((s) => normIssn(s ?? '')).filter((x): x is string => x !== null);
      if (issns.length === 0) continue;
      const sjrText = (values[c.sjr] ?? '').replace(',', '.').trim();
      const sjr = sjrText === '' || Number.isNaN(Number(sjrText)) ? null : Number(sjrText);
      const active = c.active < 0 || /^active/i.test(values[c.active] ?? '');
      const discontinued = c.discontinued >= 0 && (values[c.discontinued] ?? '').trim() !== '';
      const indexed = active && !discontinued;
      const coverage = c.coverage >= 0 ? parseCoverage(values[c.coverage] ?? '') : [];
      // Still in Scopus: the latest range runs on past the date the list was made.
      if (indexed && coverage.length > 0) coverage[coverage.length - 1]!.to = null;
      journals.push({
        issns: [...new Set(issns)],
        title: (values[c.title] ?? '').trim().slice(0, 500),
        indexed,
        sjr,
        asjc: (values[c.asjc] ?? '').split(/[;,\s]+/).filter((x) => /^\d{4}$/.test(x)),
        sourceType: c.type >= 0 ? (values[c.type] ?? '').trim().toLowerCase().slice(0, 60) : '',
        coverage,
      });
    }
    if (cols) haveMain = true;
    if (droppedCols) haveDropped = true;
  }
  if (journals.length === 0) throw new Error('No journal sheet with Source Title, ISSN, SJR and ASJC columns was found.');
  return { journals, dropped, sjrYear };
}

export interface ScopusListStatus {
  file: string;
  listYear: number;
  listMonth: number;
  sjrYear: number;
  journals: number;
  indexed: number;
  ranked: number;
  /** Titles Scopus dropped, with the last year it covered them. */
  discontinued?: number;
  fetchedAt: string;
  /** The last time the server looked for a newer list (every night), whether or not it found one. */
  checkedAt?: string;
  format?: number;
}

export async function scopusListStatus(): Promise<ScopusListStatus | null> {
  const [row] = await db.select().from(lookupCache)
    .where(and(eq(lookupCache.kind, 'meta'), eq(lookupCache.lookupKey, META_KEY))).limit(1);
  return row ? (row.result as unknown as ScopusListStatus) : null;
}

async function saveStatus(status: ScopusListStatus, tx: Pick<typeof db, 'insert'> = db) {
  await tx.insert(lookupCache)
    .values({ kind: 'meta', lookupKey: META_KEY, found: true, result: status, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: [lookupCache.kind, lookupCache.lookupKey],
      set: { result: status, fetchedAt: new Date() },
    });
}

let running: Promise<ScopusListStatus> | null = null;

/** Downloads the newest list and replaces the automatic rows. One run at a time. */
export function syncScopusList(): Promise<ScopusListStatus> {
  if (!running) running = newestLink().then(doSync).finally(() => { running = null; });
  return running;
}

async function newestLink(): Promise<ListLink> {
  if (process.env.LOOKUP_OFFLINE === '1') throw new Error('Lookups are switched off (LOOKUP_OFFLINE=1).');
  const page = await fetch(SCOPUS_LIST_PAGE, {
    headers: { 'user-agent': 'Mozilla/5.0 (DARP, BIT Mesra accreditation portal)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!page.ok) throw new Error(`The Elsevier title-list page answered HTTP ${page.status}.`);
  const link = pickNewestList(await page.text());
  if (!link) throw new Error('No Scopus title list was found on the Elsevier page.');
  return link;
}

async function doSync(link: ListLink): Promise<ScopusListStatus> {
  const file = await fetch(link.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!file.ok) throw new Error(`Downloading ${link.name} failed: HTTP ${file.status}.`);
  const { journals, dropped, sjrYear } = await readScopusList(Buffer.from(await file.arrayBuffer()));
  const quartiles = bestQuartiles(journals);

  const listings: Array<typeof journalIndexListings.$inferInsert> = [];
  const metrics: Array<typeof journalMetrics.$inferInsert> = [];
  const coverage: Array<typeof journalCoverage.$inferInsert> = [];
  const seen = new Set<string>();
  journals.forEach((j, i) => {
    for (const issn of j.issns) {
      if (j.indexed) listings.push({ issn, listName: 'Scopus', year: link.year, title: j.title, source: 'scopus-list' });
      if (j.sjr !== null && sjrYear > 0) {
        metrics.push({
          issn, year: sjrYear, title: j.title, sourceType: j.sourceType || 'journal',
          quartile: quartiles[i] ?? null, source: 'scopus-list',
        });
      }
      for (const r of j.coverage) {
        const key = `${issn}|scopus-list|${r.from}`;
        if (seen.has(key)) continue;
        seen.add(key);
        coverage.push({ issn, source: 'scopus-list', fromYear: r.from, toYear: r.to });
      }
    }
  });
  for (const d of dropped) {
    for (const issn of d.issns) {
      const key = `${issn}|scopus-discontinued|0`;
      if (seen.has(key)) continue;
      seen.add(key);
      coverage.push({ issn, source: 'scopus-discontinued', fromYear: 0, toYear: d.finalYear });
    }
  }

  const now = new Date().toISOString();
  const status: ScopusListStatus = {
    file: link.name, listYear: link.year, listMonth: link.month, sjrYear,
    journals: journals.length,
    indexed: journals.filter((j) => j.indexed).length,
    ranked: quartiles.filter((q) => q !== null).length,
    discontinued: dropped.length,
    fetchedAt: now,
    checkedAt: now,
    format: FORMAT,
  };

  await db.transaction(async (tx) => {
    await tx.delete(journalIndexListings).where(eq(journalIndexListings.source, 'scopus-list'));
    await tx.delete(journalMetrics).where(eq(journalMetrics.source, 'scopus-list'));
    await tx.delete(journalCoverage).where(inArray(journalCoverage.source, ['scopus-list', 'scopus-discontinued']));
    for (let i = 0; i < listings.length; i += 1000) {
      await tx.insert(journalIndexListings).values(listings.slice(i, i + 1000)).onConflictDoNothing();
    }
    // An official SCImago row for the same ISSN and year is kept: it wins over the computed one.
    for (let i = 0; i < metrics.length; i += 1000) {
      await tx.insert(journalMetrics).values(metrics.slice(i, i + 1000)).onConflictDoNothing();
    }
    for (let i = 0; i < coverage.length; i += 1000) {
      await tx.insert(journalCoverage).values(coverage.slice(i, i + 1000)).onConflictDoNothing();
    }
    await tx.delete(lookupCache).where(eq(lookupCache.kind, 'doi'));
    await saveStatus(status, tx);
  });

  log.info('scopus list synced', { ...status });
  return status;
}

/**
 * Looks for a newer list and downloads it only when there is one (Elsevier publishes two or three a
 * year, so most nights this is one small page request). Never throws.
 */
export async function checkForNewScopusList(): Promise<void> {
  try {
    if (process.env.LOOKUP_OFFLINE === '1') return;
    const status = await scopusListStatus();
    const link = await newestLink();
    if (status && status.file === link.name && status.format === FORMAT) {
      await saveStatus({ ...status, checkedAt: new Date().toISOString() });
      return;
    }
    if (!running) running = doSync(link).finally(() => { running = null; });
    await running;
  } catch (e) {
    log.warn('scopus list check failed', { error: e instanceof Error ? e.message : String(e) });
  }
}

/** Called at start-up: fetch when nothing is loaded yet, the copy is over a month old or outdated. Never throws. */
export async function syncScopusListIfStale(): Promise<void> {
  try {
    if (process.env.LOOKUP_OFFLINE === '1') return;
    const status = await scopusListStatus();
    const ageDays = status ? (Date.now() - Date.parse(status.fetchedAt)) / 86_400_000 : Infinity;
    if (ageDays < STALE_DAYS && status?.format === FORMAT) return;
    await syncScopusList();
  } catch (e) {
    log.warn('scopus list sync failed', { error: e instanceof Error ? e.message : String(e) });
  }
}

/* ───────────────────────────── the nightly check ───────────────────────────── */

/** 02:00 India time, when nobody is entering records. */
export const NIGHTLY_HOUR_IST = 2;

/** "2026-10-08" and the hour, in India time. */
export function istClock(d: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

/** Is the nightly check due: it is 2 AM in India and it has not run yet today? */
export function nightlyCheckDue(now: Date, lastCheckedAt: string | undefined): boolean {
  const clock = istClock(now);
  if (clock.hour !== NIGHTLY_HOUR_IST) return false;
  return !lastCheckedAt || istClock(new Date(lastCheckedAt)).day !== clock.day;
}

/** Starts the nightly check: a timer that wakes every ten minutes and runs it once, at 2 AM. */
export function scheduleNightlyScopusCheck(): NodeJS.Timeout {
  const timer = setInterval(() => {
    void (async () => {
      const status = await scopusListStatus().catch(() => null);
      if (nightlyCheckDue(new Date(), status?.checkedAt)) await checkForNewScopusList();
    })();
  }, 10 * 60_000);
  timer.unref();
  return timer;
}
