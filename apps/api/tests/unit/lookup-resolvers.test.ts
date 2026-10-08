import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Quartile and indexing come from the database; the resolvers are tested without one.
vi.mock('@/server/lookup/journals', async () => {
  const actual = await vi.importActual<typeof import('@/server/lookup/journals')>('@/server/lookup/journals');
  return {
    ...actual,
    journalFacts: async () => ({ quartile: 'Q1 (SJR 2023)', indexing: 'SCIE', flags: [] as string[] }),
  };
});

import { resolveDoi } from '@/server/lookup/doi';
import { resolveBook } from '@/server/lookup/book';
import { fromCrossref, type CrossrefWork } from '@/server/lookup/crossref';

const fixture = (name: string) => readFileSync(join('tests', 'fixtures', 'lookup', name), 'utf8');
const work = (name: string) => (JSON.parse(fixture(name)) as { message: CrossrefWork }).message;

const json = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });

const savedOffline = process.env.LOOKUP_OFFLINE;

beforeAll(() => {
  delete process.env.LOOKUP_OFFLINE;   // these tests use the stubbed fetch below
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('api.crossref.org/works/10.1109/access.2023.3237542')) return json(fixture('crossref-ieee-access.json'));
    if (url.includes('api.crossref.org/works/10.1007/978-981-19-0475-2_1')) return json(fixture('crossref-chapter.json'));
    if (url.includes('api.crossref.org/works?filter=isbn:')) return json(fixture('crossref-book-by-isbn.json'));
    if (url.includes('api.crossref.org/works/10.1109/cvpr.2016.90')) return json(fixture('crossref-proceedings.json'));
    if (url.includes('api.crossref.org/works?filter=type:proceedings,prefix:10.1109')) return json(fixture('crossref-proceedings-volume.json'));
    return new Response('', { status: 404 });   // OpenAlex and everything else
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
  if (savedOffline !== undefined) process.env.LOOKUP_OFFLINE = savedOffline;
});

describe('resolveDoi', () => {
  it('reads a real IEEE Access paper from Crossref', async () => {
    const r = await resolveDoi('10.1109/access.2023.3237542');
    expect(r.found).toBe(true);
    expect(r.source).toBe('crossref');
    expect(r.rawType).toBe('journal-article');
    expect(r.values.year).toBe('2023');
    expect(r.values.containerTitle).toContain('IEEE Access');
    expect(r.values.issn).toMatch(/^\d{4}-\d{3}[\dX]$/);
    expect(r.values.quartile).toBe('Q1 (SJR 2023)');
    expect(r.people.some((p) => p.family === 'Bhattacharjee' && p.bitAffiliated === true)).toBe(true);
  });

  it('reports an unknown DOI as not found', async () => {
    const r = await resolveDoi('10.9999/does-not-exist');
    expect(r.found).toBe(false);
  });
});

describe('fromCrossref', () => {
  it('flags a retracted work', () => {
    const r = fromCrossref(work('crossref-retracted.json'));
    expect(r.flags).toContain('retracted');
  });

  it('reads a conference paper and the name of its conference', () => {
    const r = fromCrossref(work('crossref-proceedings.json'));
    expect(r.rawType).toBe('proceedings-article');
    expect(r.values.workType).toBe('Conference paper');
    expect(r.values.eventName).toContain('Computer Vision and Pattern Recognition');
    expect(r.flags).toEqual([]);
  });
});

describe('resolveBook, conference papers', () => {
  it('fills the proceedings volume and its ISBN, which IEEE registers separately', async () => {
    const r = await resolveBook('10.1109/cvpr.2016.90');
    expect(r.values.bookType).toBe('Conference paper');
    expect(r.values.bookTitle).toBe('2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR)');
    expect(r.values.chapterTitle).not.toBe('');
    expect(r.values.isbn).toBe('9781467388511');
    expect(r.flags).toEqual([]);
  });
});

describe('resolveBook', () => {
  it('takes the book title from the parent, not the series', async () => {
    const r = await resolveBook('10.1007/978-981-19-0475-2_1');
    expect(r.values.bookType).toBe('Book chapter');
    expect(r.values.bookTitle).not.toBe('Advances in Intelligent Systems and Computing');
    expect(r.values.bookTitle).toContain('Innovations in Computational Intelligence');
    expect(r.values.chapterTitle).not.toBe('');
  });
});
