import { and, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { records, paperCitations } from '@/server/db/schema';
import { log } from '@/server/log';
import { COUNTED_STATUSES } from './counters';
import { fetchCitationsByDoi, scopusConnected, ScopusUnavailable, NotEntitled } from '@/server/researchers/scopus';
import { istClock } from '@/server/lookup/scopusList';

/*
 * Each paper's Scopus citations, by DOI, so a department's h-index can be worked out. Papers are looked
 * up 25 DOIs at a time (Elsevier allows no more per request), 1,000 a night (40 calls, about 1.4% of the weekly quota of 20,000), the ones never checked
 * first and then those checked longest ago. A number is never wiped: when Elsevier refuses or cannot be
 * reached the stored counts stay as they were.
 */

/** 05:00 India time, after the Scopus list (02:00), the patent journal (03:00) and the researchers (04:00). */
export const CITATION_HOUR_IST = 5;
export const BATCH_PER_NIGHT = 1000;
let lastRunDay: string | null = null;

/**
 * Every DOI on a counted Publications or Books record, lower-case. It reads across people, and only DOIs
 * leave this function, so it does not use scopeFilter (that would show each person only their own).
 */
export async function allDois(): Promise<string[]> {
  const doi = sql<string>`lower(${records.data} ->> 'doi')`;
  const rows = await db.selectDistinct({ doi }).from(records).where(and(
    inArray(records.moduleKey, ['publications', 'books']),
    isNull(records.deletedAt),
    inArray(records.status, COUNTED_STATUSES),
    sql`coalesce(${records.data} ->> 'doi', '') <> ''`,
  ));
  return rows.map((r) => r.doi.trim()).filter(Boolean);
}

/** Checks the DOIs never checked, then those checked longest ago, up to `limit`. Returns how many were checked. */
export async function refreshCitations(limit = BATCH_PER_NIGHT): Promise<number> {
  if (!scopusConnected() || process.env.LOOKUP_OFFLINE === '1') return 0;
  const dois = [...new Set(await allDois())];
  if (dois.length === 0) return 0;
  const seen = new Map((await db.select({ doi: paperCitations.doi, at: paperCitations.checkedAt }).from(paperCitations)).map((r) => [r.doi, r.at.getTime()]));
  const due = dois.sort((a, b) => (seen.get(a) ?? 0) - (seen.get(b) ?? 0) || a.localeCompare(b)).slice(0, limit);

  let checked = 0;
  for (let i = 0; i < due.length; i += 25) {
    const chunk = due.slice(i, i + 25);
    let found: Awaited<ReturnType<typeof fetchCitationsByDoi>>;
    try {
      found = await fetchCitationsByDoi(chunk);
    } catch (e) {
      if (e instanceof ScopusUnavailable || e instanceof NotEntitled) {
        log.warn('citation refresh stopped', { error: String(e), checked });
        return checked;
      }
      throw e;
    }
    const byDoi = new Map(found.map((f) => [f.doi, f]));
    for (const doi of chunk) {
      const hit = byDoi.get(doi);
      await db.insert(paperCitations)
        .values({ doi, scopusId: hit?.scopusId ?? null, citedBy: hit?.citedBy ?? 0, found: !!hit, checkedAt: new Date() })
        .onConflictDoUpdate({
          target: paperCitations.doi,
          // A DOI Scopus does not have keeps the count it had: it is just marked as not found.
          set: hit
            ? { scopusId: hit.scopusId, citedBy: hit.citedBy, found: true, checkedAt: new Date() }
            : { found: false, checkedAt: new Date() },
        });
      checked += 1;
    }
  }
  return checked;
}

export interface CitationStatus {
  /** An Elsevier key is set. */
  connected: boolean;
  total: number;
  checked: number;
  found: number;
  lastChecked: string | null;
}

/** What the Administration page says about the citations. */
export async function citationStatus(): Promise<CitationStatus> {
  const dois = new Set(await allDois());
  const rows = await db.select().from(paperCitations);
  const mine = rows.filter((r) => dois.has(r.doi));
  const last = mine.reduce<number>((m, r) => Math.max(m, r.checkedAt.getTime()), 0);
  return {
    connected: scopusConnected(), total: dois.size, checked: mine.length, found: mine.filter((r) => r.found).length,
    lastChecked: last ? new Date(last).toISOString() : null,
  };
}

/** Starts the nightly job: a timer that wakes every ten minutes and runs once, at 5 AM India time. */
export function scheduleCitationRefresh(): NodeJS.Timeout {
  const timer = setInterval(() => {
    const clock = istClock(new Date());
    if (clock.hour !== CITATION_HOUR_IST || lastRunDay === clock.day) return;
    lastRunDay = clock.day;
    void refreshCitations().then((n) => log.info('citation refresh', { checked: n })).catch((e) => log.warn('citation nightly refresh failed', { error: String(e) }));
  }, 10 * 60_000);
  timer.unref();
  return timer;
}
