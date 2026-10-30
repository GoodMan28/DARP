import { describe, it, expect } from 'vitest';
import {
  COUNTERS, DECLARED_COUNTERS, ALL_COUNTER_KEYS, computeCounters,
  COUNTED_STATUSES, EXPORTABLE_STATUSES, withCycleYears, lastCompletedYear, declaredStorageKey,
  type CountableRecord, type CycleBounds,
} from '@/server/rollups/counters';
import { MODULE_LIST, getModule } from '@darp/shared/modules';
import type { PeriodType } from '@darp/shared/modules/types';

const bounds: CycleBounds = { CY: [2022, 2024], FY: [2022, 2024], AY: [2022, 2024] };
const pt = (k: string): PeriodType => getModule(k)!.periodType;

const rec = (over: Partial<CountableRecord>): CountableRecord => ({
  moduleKey: 'publications', periodYear: 2024, status: 'submitted', data: {}, ...over,
});

describe('counter catalogue', () => {
  it('matches the feedsCounters declared by the module configs exactly', () => {
    const fromModules = new Set<string>();
    for (const m of MODULE_LIST) for (const c of m.feedsCounters ?? []) fromModules.add(c);
    const fromCatalogue = new Set(COUNTERS.map((c) => c.key));

    const missing = [...fromModules].filter((k) => !fromCatalogue.has(k));
    const extra = [...fromCatalogue].filter((k) => !fromModules.has(k));
    expect(missing, `declared by modules but not defined: ${missing.join(', ')}`).toEqual([]);
    expect(extra, `defined but no module feeds them: ${extra.join(', ')}`).toEqual([]);
  });

  it('adds up to the 84 rows of the Faculty Profile sheet, plus conference papers, journal rankings and valid awards', () => {
    // The sheet has no conference-paper row; NAAC 3.4 counts them with books and chapters.
    expect(getModule('profile')!.fields).toHaveLength(22);
    expect(COUNTERS).toHaveLength(67);
    expect(COUNTERS.filter((c) => c.key.startsWith('books.count.conference'))).toHaveLength(2);
    // Papers by their journal's indexing and quartile (Scopus, Web of Science, Q1/Q2).
    expect(COUNTERS.filter((c) => c.ranking)).toHaveLength(6);
    // Awards, research awards, extension awards and fellowships still valid today.
    expect(COUNTERS.filter((c) => c.window === 'today')).toHaveLength(4);
    expect(DECLARED_COUNTERS).toHaveLength(13);
    // Outreach activities, all and outside BIT, for the range and since joining.
    expect(COUNTERS.filter((c) => c.moduleKey === 'outreach')).toHaveLength(4);
    expect(22 + COUNTERS.length + DECLARED_COUNTERS.length).toBe(84 + 2 + 6 + 2 + 4 + 4);
  });

  it('has unique keys, a known module and a sum field wherever it sums', () => {
    expect(new Set(ALL_COUNTER_KEYS).size).toBe(ALL_COUNTER_KEYS.length);
    for (const c of COUNTERS) {
      expect(getModule(c.moduleKey), `${c.key} names an unknown module`).toBeTruthy();
      if (c.metric === 'sum') expect(c.sumField, `${c.key} has no sumField`).toBeTruthy();
      if (c.filter) {
        const fields = getModule(c.moduleKey)!.fields.map((f) => f.key);
        expect(fields, `${c.key} filters on a field ${c.moduleKey} does not have`).toContain(c.filter.field);
      }
      if (c.sumField) {
        const fields = getModule(c.moduleKey)!.fields.map((f) => f.key);
        expect(fields, `${c.key} sums a field ${c.moduleKey} does not have`).toContain(c.sumField);
      }
    }
  });

  it('counts submitted work on a tile but never in an export', () => {
    expect(COUNTED_STATUSES).toEqual(['submitted', 'verified', 'approved']);
    expect(EXPORTABLE_STATUSES).toEqual(['verified', 'approved']);
    expect(COUNTED_STATUSES).not.toContain('draft');
    expect(COUNTED_STATUSES).not.toContain('returned');
  });
});

describe('computation', () => {
  it('ignores drafts and returned records', () => {
    const out = computeCounters([
      rec({ status: 'draft' }), rec({ status: 'returned' }), rec({ status: 'submitted' }),
    ], bounds, pt);
    expect(out['publications.count.cycle']).toBe(1);
  });

  it('respects the cycle window but not for since-joining', () => {
    const out = computeCounters([rec({ periodYear: 2019 }), rec({ periodYear: 2023 })], bounds, pt);
    expect(out['publications.count.cycle']).toBe(1);
    expect(out['publications.count.sinceJoining']).toBe(2);
  });

  it('counts papers in conference proceedings on their own, not as chapters', () => {
    const out = computeCounters([
      rec({ moduleKey: 'books', data: { publicationType: 'Conference paper' } }),
      rec({ moduleKey: 'books', data: { publicationType: 'Conference paper' }, periodYear: 2019 }),
      rec({ moduleKey: 'books', data: { publicationType: 'Book chapter' } }),
    ], bounds, pt);
    expect(out['books.count.conference.cycle']).toBe(1);
    expect(out['books.count.conference.sinceJoining']).toBe(2);
    expect(out['books.count.chapter.cycle']).toBe(1);
  });

  it('splits on a filter field', () => {
    const out = computeCounters([
      rec({ moduleKey: 'patents', data: { status: 'Published' } }),
      rec({ moduleKey: 'patents', data: { status: 'Granted' } }),
      rec({ moduleKey: 'patents', data: { status: 'Granted' } }),
    ], bounds, pt);
    expect(out['patents.count.published.cycle']).toBe(1);
    expect(out['patents.count.granted.cycle']).toBe(2);
  });

  it('counts each patent stage in the year of its own date', () => {
    // Filed 2021, published 2023, granted 2025: dated 2025 as a record, but each stage counts in its own year.
    const granted = rec({ moduleKey: 'patents', periodYear: 2025, data: {
      status: 'Granted', filedDate: '2021-11-02', publishedDate: '2023-03-10', grantDate: '2025-01-20',
    } });
    const applied = rec({ moduleKey: 'patents', periodYear: 2022, data: {
      status: 'Applied', filedDate: '2022-05-05', publishedDate: '2023-01-01',   // a stale hidden date
    } });
    const out = computeCounters([granted, applied], bounds, pt);
    expect(out['patents.count.filed.cycle']).toBe(1);          // only the 2022 filing is inside 2022–2024
    expect(out['patents.count.filed.sinceJoining']).toBe(2);
    expect(out['patents.count.published.cycle']).toBe(1);      // published 2023, though granted later
    expect(out['patents.count.granted.cycle']).toBe(0);        // granted 2025, outside the range
    expect(out['patents.count.granted.sinceJoining']).toBe(1);
  });

  it('sums money as whole rupees, tolerating separators', () => {
    const out = computeCounters([
      rec({ moduleKey: 'grants', data: { role: 'PI', amount: '4820000' } }),
      rec({ moduleKey: 'grants', data: { role: 'PI', amount: '26,50,000' } }),
      rec({ moduleKey: 'grants', data: { role: 'Co-PI', amount: '3100000' } }),
    ], bounds, pt);
    expect(out['grants.sum.pi.cycle']).toBe(7470000);
    expect(out['grants.count.pi.cycle']).toBe(2);
    expect(out['grants.sum.copi.cycle']).toBe(3100000);
  });

  it('adds the baseline to since-joining counters only', () => {
    const out = computeCounters([rec({})], bounds, pt, { 'publications.count.sinceJoining': 40 });
    expect(out['publications.count.sinceJoining']).toBe(41);
    expect(out['publications.count.cycle']).toBe(1);
  });

  it('never returns a negative, fractional or NaN value', () => {
    const out = computeCounters([
      rec({ moduleKey: 'grants', data: { role: 'PI', amount: 'not a number' } }),
      rec({ moduleKey: 'fellowships', data: { amount: '-500' } }),
      rec({ moduleKey: 'seedmoney', data: { amount: '12.75' } }),
    ], bounds, pt);
    for (const [k, v] of Object.entries(out)) {
      expect(Number.isFinite(v), `${k} is not finite`).toBe(true);
      expect(Number.isInteger(v), `${k} is fractional`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    // Every counter key is present, even with nothing to count.
    expect(Object.keys(out)).toHaveLength(COUNTERS.length);
  });

  it('counts the awards still valid today, whatever their year', () => {
    const today = new Date('2026-10-30');
    const out = computeCounters([
      rec({ moduleKey: 'awards', periodYear: 2024, data: { awardDate: '2024-03-15', validityYears: '3' } }), // to 14-03-2027
      rec({ moduleKey: 'awards', periodYear: 2024, data: { awardDate: '2024-03-15', validityYears: '2' } }), // ended 14-03-2026
      rec({ moduleKey: 'awards', periodYear: 2001, data: { awardDate: '2001-01-10', validForLife: true } }),
      rec({ moduleKey: 'awards', periodYear: 2023, data: { awardDate: '2023-06-01' } }),                      // validity not given
      rec({ moduleKey: 'awards', periodYear: 2025, status: 'draft', data: { awardDate: '2025-06-01', validForLife: true } }),
      rec({ moduleKey: 'fellowships', periodYear: 2025, data: { awardDate: '2026-02-10', validityYears: '1' } }),
    ], bounds, pt, {}, today);
    expect(out['awards.count.active']).toBe(2);
    expect(out['fellowships.count.active']).toBe(1);
    // An old record without a validity still counts under its year.
    expect(out['awards.count.sinceJoining']).toBe(4);
  });

  it('gives every counter a zero when the person has entered nothing', () => {
    const out = computeCounters([], bounds, pt);
    expect(Object.values(out).every((v) => v === 0)).toBe(true);
  });
});

describe('counter labels follow the active cycle', () => {
  it('fills the years of the cycle IQAC set, instead of fixed ones', () => {
    const cycle4 = { CY: [2022, 2024], FY: [2022, 2024], AY: [2022, 2024] } as CycleBounds;
    const cycle5 = { CY: [2025, 2029], FY: [2025, 2029], AY: [2025, 2029] } as CycleBounds;
    expect(withCycleYears('Publications {CY}', cycle4)).toBe('Publications 2022–2024');
    expect(withCycleYears('Consultancy projects, {FY}', cycle4)).toBe('Consultancy projects, FY 2022-23 to 2024-25');
    expect(withCycleYears('UG students guided, {AY}', cycle5)).toBe('UG students guided, AY 2025-26 to 2029-30');
    // One year is named once.
    const one = { CY: [2024, 2024], FY: [2024, 2024], AY: [2024, 2024] } as CycleBounds;
    expect(withCycleYears('Grants {FY} · papers {CY}', one)).toBe('Grants FY 2024-25 · papers 2024');
    const later = new Date('2031-01-01');
    expect(withCycleYears('Visited a foreign university in {lastAY}?', cycle5, later)).toBe('Visited a foreign university in AY 2029-30?');
    expect(withCycleYears('Papers presented, {lastCY}', cycle5, later)).toBe('Papers presented, CY 2029');
  });

  it('never calls a year still running "last year"', () => {
    // The user's case: a range ending 2026, read on 30 October 2026.
    const range = { CY: [2024, 2026], FY: [2024, 2026], AY: [2024, 2026] } as CycleBounds;
    const today = new Date('2026-10-30');
    expect(withCycleYears('Seminars last year ({lastAY})', range, today)).toBe('Seminars last year (AY 2025-26)');
    expect(withCycleYears('Papers last year ({lastCY})', range, today)).toBe('Papers last year (CY 2025)');
    expect(lastCompletedYear('AY', new Date('2026-06-30'))).toBe(2024);   // AY 2025-26 ends that day
    expect(lastCompletedYear('AY', new Date('2026-07-01'))).toBe(2025);
    expect(lastCompletedYear('FY', new Date('2026-03-31'))).toBe(2024);
    expect(lastCompletedYear('FY', new Date('2026-04-01'))).toBe(2025);
  });

  it('keeps a "last year" figure for its own year', () => {
    const seminars = DECLARED_COUNTERS.find((c) => c.key === 'manual.seminars.national.cycle')!;
    const since = DECLARED_COUNTERS.find((c) => c.key === 'manual.seminars.national.sinceJoining')!;
    const range = { CY: [2022, 2024], FY: [2022, 2024], AY: [2022, 2024] } as CycleBounds;
    expect(declaredStorageKey(seminars, range, new Date('2026-10-30'))).toBe('manual.seminars.national.cycle@2024');
    expect(declaredStorageKey(since, range, new Date('2026-10-30'))).toBe('manual.seminars.national.sinceJoining');
  });

  it('leaves no year written into the catalogue', () => {
    for (const label of [...COUNTERS.map((c) => c.label), ...DECLARED_COUNTERS.map((c) => c.label)]) {
      expect(label, label).not.toMatch(/20\d\d/);
    }
  });
});
