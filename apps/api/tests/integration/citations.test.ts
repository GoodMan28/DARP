import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { records, paperCitations } from '@/server/db/schema';
import { fetchCitationsByDoi } from '@/server/researchers/scopus';
import { allDois, refreshCitations, citationStatus } from '@/server/rollups/citations';
import { hIndex } from '@darp/shared/research';
import type { SessionUser } from '@/server/auth/session';

/*
 * Phase 2 of the visual-insights plan: each paper's Scopus citations, by DOI. Elsevier is stubbed:
 * nothing is sent to it. The key and the lookups are switched on for these tests only.
 */

let owner: SessionUser;
const SAVED = { key: process.env.ELSEVIER_API_KEY, offline: process.env.LOOKUP_OFFLINE };

async function paper(doi: string, over: { status?: 'draft' | 'approved'; module?: string; deleted?: boolean } = {}) {
  await db.insert(records).values({
    moduleKey: over.module ?? 'publications', ownerUserId: owner.id, createdBy: owner.id, departmentId: owner.departmentId,
    status: over.status ?? 'approved', periodLabel: '2024', periodYear: 2024, data: { doi, title: 'T' },
    ...(over.deleted ? { deletedAt: new Date() } : {}),
  });
}

/** Elsevier's answer to a search: the DOIs it knows, in the case the publisher wrote them. */
function elsevierKnows(known: Record<string, number>, calls: string[] = []) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(decodeURIComponent(String(url)));
    const asked = [...decodeURIComponent(String(url)).matchAll(/DOI\("([^"]+)"\)/g)].map((m) => m[1]!);
    const entry = asked.filter((d) => d.toLowerCase() in known).map((d, i) => ({
      'dc:identifier': `SCOPUS_ID:${8500000 + i}`, 'prism:doi': d.toUpperCase(), 'citedby-count': String(known[d.toLowerCase()]),
    }));
    return Response.json({ 'search-results': { 'opensearch:totalResults': String(entry.length), entry } });
  }));
}

beforeAll(async () => {
  await truncateAll();
  owner = await makeUser({ role: 'faculty', dept: 'CSE' });
  process.env.ELSEVIER_API_KEY = 'test-key';
  process.env.LOOKUP_OFFLINE = '0';
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await db.delete(paperCitations);
  await db.delete(records).where(eq(records.ownerUserId, owner.id));
});
afterAll(async () => {
  if (SAVED.key === undefined) delete process.env.ELSEVIER_API_KEY; else process.env.ELSEVIER_API_KEY = SAVED.key;
  process.env.LOOKUP_OFFLINE = SAVED.offline ?? '1';
  await closeDb();
});

describe('asking Scopus for citations by DOI', () => {
  it('names each DOI in one query, and stores Scopus’s upper-case answer in lower case', async () => {
    const calls: string[] = [];
    elsevierKnows({ '10.1016/j.a.2024.1': 12, '10.1109/b.2024.2': 3 }, calls);
    const got = await fetchCitationsByDoi(['10.1016/j.a.2024.1', '10.1109/b.2024.2', '10.5555/none']);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('DOI("10.1016/j.a.2024.1") OR DOI("10.1109/b.2024.2") OR DOI("10.5555/none")');
    expect(got.map((g) => g.doi).sort()).toEqual(['10.1016/j.a.2024.1', '10.1109/b.2024.2']);
    expect(got.find((g) => g.doi === '10.1016/j.a.2024.1')).toMatchObject({ citedBy: 12 });
  });

  it('skips a DOI that holds a quotation mark or a backslash, and sends at most 25', async () => {
    const calls: string[] = [];
    elsevierKnows({}, calls);
    await fetchCitationsByDoi(['10.1/ok', '10.1/bad"quote', '10.1/bad\\slash']);
    expect(calls[0]).toContain('DOI("10.1/ok")');
    expect(calls[0]).not.toContain('bad');
    calls.length = 0;
    await fetchCitationsByDoi(Array.from({ length: 40 }, (_, i) => `10.1/p${i}`));
    expect((calls[0]!.match(/DOI\(/g) ?? []).length).toBe(25);
    expect(await fetchCitationsByDoi(['10.1/bad"quote'])).toEqual([]);
  });
});

describe('the DOIs to check', () => {
  it('are the distinct DOIs of counted papers and books: not a draft, not a deleted one, not a record with none', async () => {
    await paper('10.1/Counted');
    await paper('10.1/COUNTED');                                         // the same DOI, written another way
    await paper('10.1/book', { module: 'books' });
    await paper('10.1/draft', { status: 'draft' });
    await paper('10.1/gone', { deleted: true });
    await paper('');
    await paper('10.1/patent-is-not-a-paper', { module: 'patents' });
    expect((await allDois()).sort()).toEqual(['10.1/book', '10.1/counted']);
  });
});

describe('refreshing the citations', () => {
  it('stores what Scopus has, and marks a DOI it does not have as not found', async () => {
    await paper('10.1/found'); await paper('10.1/missing');
    elsevierKnows({ '10.1/found': 7 });
    expect(await refreshCitations()).toBe(2);
    const rows = Object.fromEntries((await db.select().from(paperCitations)).map((r) => [r.doi, r]));
    expect(rows['10.1/found']).toMatchObject({ found: true, citedBy: 7 });
    expect(rows['10.1/missing']).toMatchObject({ found: false, citedBy: 0 });
  });

  it('checks never-checked DOIs first, then the oldest, up to the limit', async () => {
    for (const d of ['10.1/a', '10.1/b', '10.1/c']) await paper(d);
    await db.insert(paperCitations).values([
      { doi: '10.1/a', citedBy: 1, found: true, checkedAt: new Date('2026-10-01') },
      { doi: '10.1/b', citedBy: 1, found: true, checkedAt: new Date('2026-09-01') },     // checked longest ago
    ]);
    const calls: string[] = [];
    elsevierKnows({ '10.1/c': 5, '10.1/b': 9, '10.1/a': 2 }, calls);
    expect(await refreshCitations(2)).toBe(2);
    expect(calls[0]).toContain('DOI("10.1/c")');                                    // never checked
    expect(calls[0]).toContain('DOI("10.1/b")');                                    // then the oldest
    expect(calls[0]).not.toContain('DOI("10.1/a")');
  });

  it('makes one call for each 25 DOIs', async () => {
    for (let i = 0; i < 60; i += 1) await paper(`10.1/many${i}`);
    const calls: string[] = [];
    elsevierKnows({}, calls);
    expect(await refreshCitations()).toBe(60);
    expect(calls).toHaveLength(3);
  });

  it('keeps the numbers it had when Elsevier refuses or cannot be reached', async () => {
    await paper('10.1/kept');
    await db.insert(paperCitations).values({ doi: '10.1/kept', citedBy: 40, found: true, checkedAt: new Date('2026-01-01') });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    expect(await refreshCitations()).toBe(0);
    expect((await db.select().from(paperCitations))[0]).toMatchObject({ citedBy: 40, found: true });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await refreshCitations()).toBe(0);
    expect((await db.select().from(paperCitations))[0]).toMatchObject({ citedBy: 40 });
  });

  it('keeps an earlier count for a DOI Scopus no longer answers for, only marking it not found', async () => {
    await paper('10.1/dropped');
    await db.insert(paperCitations).values({ doi: '10.1/dropped', citedBy: 11, found: true, checkedAt: new Date('2026-01-01') });
    elsevierKnows({});
    await refreshCitations();
    expect((await db.select().from(paperCitations))[0]).toMatchObject({ doi: '10.1/dropped', found: false, citedBy: 11 });
  });

  it('does nothing without a key, or with lookups switched off', async () => {
    await paper('10.1/x');
    const calls: string[] = [];
    elsevierKnows({ '10.1/x': 1 }, calls);
    delete process.env.ELSEVIER_API_KEY;
    expect(await refreshCitations()).toBe(0);
    process.env.ELSEVIER_API_KEY = 'test-key';
    process.env.LOOKUP_OFFLINE = '1';
    expect(await refreshCitations()).toBe(0);
    process.env.LOOKUP_OFFLINE = '0';
    expect(calls).toHaveLength(0);
  });
});

describe('what the Administration page says', () => {
  it('counts the papers, how many are checked and found, and when', async () => {
    await paper('10.1/one'); await paper('10.1/two'); await paper('10.1/three');
    elsevierKnows({ '10.1/one': 4 });
    await refreshCitations(2);
    const s = await citationStatus();
    expect(s).toMatchObject({ connected: true, total: 3, checked: 2 });
    expect(s.found).toBeLessThanOrEqual(1);
    expect(s.lastChecked).not.toBeNull();
  });
});

describe('the h-index of a group of papers', () => {
  it('is the largest h with h papers of at least h citations: not the sum, the average, or a person’s', () => {
    expect(hIndex([10, 8, 5, 4, 3])).toBe(4);
    expect(hIndex([100])).toBe(1);
    expect(hIndex([0, 0, 0])).toBe(0);
    expect(hIndex([3, 3, 3])).toBe(3);
    expect(hIndex([])).toBe(0);
    expect(hIndex([10, 8, 5, 4, 3, 0, 0, 0])).toBe(4);               // a paper with no citations does not raise it
  });
});
