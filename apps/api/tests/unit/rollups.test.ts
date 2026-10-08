import { describe, it, expect } from 'vitest';
import {
  COUNTERS, DECLARED_COUNTERS, ALL_COUNTER_KEYS, computeCounters,
  COUNTED_STATUSES, EXPORTABLE_STATUSES, withCycleYears,
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

  it('adds up to the 84 rows of the Faculty Profile sheet', () => {
    expect(getModule('profile')!.fields).toHaveLength(22);
    expect(COUNTERS).toHaveLength(49);
    expect(DECLARED_COUNTERS).toHaveLength(13);
    expect(22 + COUNTERS.length + DECLARED_COUNTERS.length).toBe(84);
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

  it('splits on a filter field', () => {
    const out = computeCounters([
      rec({ moduleKey: 'patents', data: { status: 'Published' } }),
      rec({ moduleKey: 'patents', data: { status: 'Awarded/Granted' } }),
      rec({ moduleKey: 'patents', data: { status: 'Awarded/Granted' } }),
    ], bounds, pt);
    expect(out['patents.count.published.cycle']).toBe(1);
    expect(out['patents.count.granted.cycle']).toBe(2);
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
    expect(withCycleYears('Consultancy projects, {FY}', cycle4)).toBe('Consultancy projects, FY 2022-25');
    expect(withCycleYears('UG students guided, {AY}', cycle5)).toBe('UG students guided, AY 2025-30');
    expect(withCycleYears('Visited a foreign university in {lastAY}?', cycle5)).toBe('Visited a foreign university in AY 2029-30?');
    expect(withCycleYears('Papers presented, {lastCY}', cycle5)).toBe('Papers presented, CY 2029');
  });

  it('leaves no year written into the catalogue', () => {
    for (const label of [...COUNTERS.map((c) => c.label), ...DECLARED_COUNTERS.map((c) => c.label)]) {
      expect(label, label).not.toMatch(/20\d\d/);
    }
  });
});
