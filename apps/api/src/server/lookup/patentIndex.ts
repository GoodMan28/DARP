import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { lookupCache, patentApplications, patentGrants, patentJournalParts } from '@/server/db/schema';
import { log } from '@/server/log';
import { JournalReader, isoDate } from './patentJournal';
import { pdfPages } from './patentPdf';
import { istClock } from './scopusList';
import { refreshPatentRecords } from '@/server/records/patentRefresh';

/**
 * Keeps a local index of the Patent Office Journal, so a patent's details can be fetched by its
 * number. IP India has no API, and its search (InPASS) sits behind a CAPTCHA that must never be
 * automated; the weekly Official Journal, a statutory publication, is offered as plain PDFs
 * (no login, no CAPTCHA). Each part is downloaded once, one at a time, read, and kept as rows.
 *
 * Newest issues first, back to January of PATENT_JOURNAL_FROM (default 2019). The first run
 * reads several years of issues and takes some hours in the background; after that, the nightly
 * check reads only the week's new issue.
 */

export const JOURNAL_LIST_PAGE = 'https://search.ipindia.gov.in/IPOJournal/Journal/Patent';
const VIEW_URL = 'https://search.ipindia.gov.in/IPOJournal/Journal/ViewJournal';
const USER_AGENT = 'Mozilla/5.0 (DARP, BIT Mesra accreditation portal; iqac@bitmesra.ac.in)';
const META_KEY = 'patent-journal';
/** A part runs to 30 MB; anything far larger is not a journal part. */
const MAX_BYTES = 120 * 1024 * 1024;
/** Between two downloads, so the index never weighs on IP India's server. */
const PAUSE_MS = Number(process.env.PATENT_JOURNAL_PAUSE_MS ?? 3000);

export const fromYear = () => Number(process.env.PATENT_JOURNAL_FROM ?? 2019);

export interface JournalIssue {
  /** e.g. '16/2024' */
  issue: string;
  /** ISO date of publication. */
  date: string;
  /** The parts to read: the designs part is left out. */
  files: string[];
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

/** The issues on the journal's listing page, newest first. */
export function parseJournalListing(html: string): JournalIssue[] {
  const issues: JournalIssue[] = [];
  for (const row of html.split(/<tr[\s>]/i).slice(1)) {
    const cells = [...row.matchAll(/<td>\s*([^<]*?)\s*<\/td>/gi)].map((m) => m[1]!);
    const issue = cells.find((c) => /^\d{1,2}\/\d{4}$/.test(c));
    const date = isoDate(cells.find((c) => /^\d{2}\/\d{2}\/\d{4}$/.test(c)) ?? '');
    if (!issue || !date) continue;
    const files: string[] = [];
    // Each part is a small form: the file name, then the button's label ("Part I", "Part IV - Designs").
    for (const m of row.matchAll(/name="FileName"\s+value="([^"]+)"[\s\S]*?<button[^>]*>\s*([^<]*)/gi)) {
      const fileName = decode(m[1]!);
      if (/design/i.test(m[2]!) || /design/i.test(fileName)) continue;
      files.push(fileName);
    }
    if (files.length) issues.push({ issue, date, files });
  }
  return issues.sort((a, b) => b.date.localeCompare(a.date));
}

async function fetchListing(): Promise<JournalIssue[]> {
  const res = await fetch(JOURNAL_LIST_PAGE, {
    headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`The journal listing answered HTTP ${res.status}.`);
  const issues = parseJournalListing(await res.text());
  if (issues.length === 0) throw new Error('No journal issues were found on the IP India listing page.');
  return issues;
}

async function download(fileName: string): Promise<Uint8Array> {
  const res = await fetch(VIEW_URL, {
    method: 'POST',
    headers: { 'user-agent': USER_AGENT, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ FileName: fileName }).toString(),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error(`file too large (${bytes.length} bytes)`);
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('not a PDF');
  return bytes;
}

/** Reads one part and stores what it publishes. Returns the counts. */
export async function indexPart(issue: JournalIssue, fileName: string, bytes: Uint8Array) {
  const reader = new JournalReader();
  for await (const items of pdfPages(bytes)) reader.page(items);
  const { applications, grants } = reader.result();

  await db.transaction(async (tx) => {
    for (let i = 0; i < applications.length; i += 500) {
      const batch = applications.slice(i, i + 500).map((a) => ({
        applicationNo: a.applicationNo,
        title: a.title,
        filedDate: a.filedDate || null,
        publishedDate: a.publishedDate || null,
        applicants: a.applicants,
        inventors: a.inventors,
        issue: issue.issue,
      }));
      await tx.insert(patentApplications).values(batch).onConflictDoUpdate({
        target: patentApplications.applicationNo,
        set: {
          title: sql`excluded.title`, filedDate: sql`excluded.filed_date`, publishedDate: sql`excluded.published_date`,
          applicants: sql`excluded.applicants`, inventors: sql`excluded.inventors`, issue: sql`excluded.issue`,
          importedAt: sql`now()`,
        },
      });
    }
    for (let i = 0; i < grants.length; i += 500) {
      const batch = grants.slice(i, i + 500).map((g) => ({
        patentNo: g.patentNo,
        applicationNo: g.applicationNo,
        title: g.title,
        patentee: g.patentee,
        filedDate: g.filedDate || null,
        publishedDate: g.publishedDate || null,
        office: g.office,
        grantPublishedDate: issue.date,
        issue: issue.issue,
      }));
      await tx.insert(patentGrants).values(batch).onConflictDoNothing();
    }
    await tx.insert(patentJournalParts).values({
      fileName, issue: issue.issue, issueDate: issue.date, status: 'indexed',
      applications: applications.length, grants: grants.length,
    }).onConflictDoUpdate({
      target: patentJournalParts.fileName,
      set: { status: 'indexed', applications: applications.length, grants: grants.length, error: null, indexedAt: new Date() },
    });
  });
  return { applications: applications.length, grants: grants.length };
}

export interface PatentIndexStatus {
  fromYear: number;
  /** Parts listed by IP India in the years covered, and how many are read. */
  partsListed: number | null;
  partsIndexed: number;
  partsFailed: number;
  applications: number;
  grants: number;
  /** The newest and oldest issue read, e.g. '41/2026' and its date. */
  newestIssue: { issue: string; date: string } | null;
  oldestIssue: { issue: string; date: string } | null;
  running: boolean;
  /** The last time the server looked for new issues. */
  checkedAt: string | null;
  lastError: string | null;
}

interface Meta { checkedAt?: string; partsListed?: number; lastError?: string | null }

async function readMeta(): Promise<Meta> {
  const [row] = await db.select().from(lookupCache)
    .where(and(eq(lookupCache.kind, 'meta'), eq(lookupCache.lookupKey, META_KEY))).limit(1);
  return (row?.result as Meta | undefined) ?? {};
}

async function writeMeta(meta: Meta) {
  const result = { ...(await readMeta()), ...meta };
  await db.insert(lookupCache)
    .values({ kind: 'meta', lookupKey: META_KEY, found: true, result, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: [lookupCache.kind, lookupCache.lookupKey], set: { result, fetchedAt: new Date() } });
}

let running: Promise<void> | null = null;

export async function patentIndexStatus(): Promise<PatentIndexStatus> {
  const meta = await readMeta();
  const parts = await db.select({ status: patentJournalParts.status, n: count() }).from(patentJournalParts)
    .groupBy(patentJournalParts.status);
  const [apps] = await db.select({ n: count() }).from(patentApplications);
  const [grants] = await db.select({ n: count() }).from(patentGrants);
  const indexed = eq(patentJournalParts.status, 'indexed');
  const [newest] = await db.select({ issue: patentJournalParts.issue, date: patentJournalParts.issueDate })
    .from(patentJournalParts).where(indexed).orderBy(desc(patentJournalParts.issueDate)).limit(1);
  const [oldest] = await db.select({ issue: patentJournalParts.issue, date: patentJournalParts.issueDate })
    .from(patentJournalParts).where(indexed).orderBy(patentJournalParts.issueDate).limit(1);
  return {
    fromYear: fromYear(),
    partsListed: meta.partsListed ?? null,
    partsIndexed: parts.find((p) => p.status === 'indexed')?.n ?? 0,
    partsFailed: parts.find((p) => p.status === 'failed')?.n ?? 0,
    applications: apps?.n ?? 0,
    grants: grants?.n ?? 0,
    newestIssue: newest ?? null,
    oldestIssue: oldest ?? null,
    running: running !== null,
    checkedAt: meta.checkedAt ?? null,
    lastError: meta.lastError ?? null,
  };
}

/**
 * Reads every part not read yet, newest first, back to January of `fromYear()`. A part that fails
 * is noted and tried again on the next run. One run at a time; never throws.
 */
export function updatePatentIndex(opts: { maxParts?: number } = {}): Promise<void> {
  if (!running) running = runUpdate(opts).finally(() => { running = null; });
  return running;
}

async function runUpdate({ maxParts = Infinity }: { maxParts?: number }) {
  try {
    if (process.env.LOOKUP_OFFLINE === '1') return;
    const issues = (await fetchListing()).filter((i) => Number(i.date.slice(0, 4)) >= fromYear());
    const done = new Set((await db.select({ f: patentJournalParts.fileName }).from(patentJournalParts)
      .where(eq(patentJournalParts.status, 'indexed'))).map((r) => r.f));
    const todo = issues.flatMap((i) => i.files.map((f) => ({ issue: i, fileName: f }))).filter((t) => !done.has(t.fileName));
    await writeMeta({ checkedAt: new Date().toISOString(), partsListed: issues.reduce((n, i) => n + i.files.length, 0), lastError: null });
    log.info('patent journal: parts to read', { count: todo.length });

    let read = 0;
    for (const t of todo) {
      if (read >= maxParts) break;
      read += 1;
      try {
        const counts = await indexPart(t.issue, t.fileName, await download(t.fileName));
        log.info('patent journal part read', { issue: t.issue.issue, ...counts });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        log.warn('patent journal part failed', { issue: t.issue.issue, error });
        await db.insert(patentJournalParts).values({
          fileName: t.fileName, issue: t.issue.issue, issueDate: t.issue.date, status: 'failed', error,
        }).onConflictDoUpdate({
          target: patentJournalParts.fileName, set: { status: 'failed', error, indexedAt: new Date() },
        });
      }
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    // Saved patents move forward (Applied → Published → Granted) as the index catches up.
    await refreshPatentRecords();
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.warn('patent journal update failed', { error });
    await writeMeta({ checkedAt: new Date().toISOString(), lastError: error }).catch(() => undefined);
  }
}

/** 03:00 India time: an hour after the Scopus check, when nobody is entering records. */
export const PATENT_HOUR_IST = 3;

export function patentCheckDue(now: Date, lastCheckedAt: string | null | undefined): boolean {
  const clock = istClock(now);
  if (clock.hour !== PATENT_HOUR_IST) return false;
  return !lastCheckedAt || istClock(new Date(lastCheckedAt)).day !== clock.day;
}

/**
 * At start-up, reads whatever is not read yet (the first time: several years of issues, in the
 * background); then every night at 3 AM India time, the week's new issue. Never blocks or throws.
 */
export function schedulePatentJournal(): NodeJS.Timeout {
  void updatePatentIndex();
  const timer = setInterval(() => {
    void (async () => {
      const meta = await readMeta().catch(() => ({} as Meta));
      if (patentCheckDue(new Date(), meta.checkedAt)) await updatePatentIndex();
    })();
  }, 10 * 60_000);
  timer.unref();
  return timer;
}
