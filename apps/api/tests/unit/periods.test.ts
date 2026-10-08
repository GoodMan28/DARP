import { describe, it, expect } from 'vitest';
import {
  periodSourceField, resolvePeriod, yearOfPeriod, labelFor, isInsideCycle, periodOptions,
} from '@/server/records/periods';
import { MODULES, MODULE_LIST } from '@darp/shared/modules';

const cycle = {
  id: 'c1',
  cyStart: '2022-01-01', cyEnd: '2024-12-31',
  fyStart: '2022-04-01', fyEnd: '2025-03-31',
  ayStart: '2022-07-01', ayEnd: '2025-06-30',
};

describe('period resolution', () => {
  it('maps financial and academic years the Indian way', () => {
    expect(yearOfPeriod(new Date('2024-03-31'), 'FY')).toBe(2023);   // still FY 2023-24
    expect(yearOfPeriod(new Date('2024-04-01'), 'FY')).toBe(2024);
    expect(yearOfPeriod(new Date('2024-06-30'), 'AY')).toBe(2023);   // still AY 2023-24
    expect(yearOfPeriod(new Date('2024-07-01'), 'AY')).toBe(2024);
    expect(yearOfPeriod(new Date('2024-02-10'), 'CY')).toBe(2024);
    expect(labelFor(2024, 'FY')).toBe('FY 2024-25');
    expect(labelFor(2024, 'AY')).toBe('AY 2024-25');
    expect(labelFor(2024, 'CY')).toBe('2024');
  });

  it('prints the source field for all 24 modules — REVIEW THIS OUTPUT ONCE', () => {
    const table = MODULE_LIST.map((m) => {
      const src = periodSourceField(m);
      return `${m.key.padEnd(16)} ${m.periodType}  ${src ? `${src.kind}:${src.key}` : '(falls back to the cycle end)'}`;
    });
    console.error('\nPeriod source per module:\n' + table.join('\n'));
    expect(table).toHaveLength(24);
  });

  it('falls back to the cycle end year when a record has no usable date', () => {
    const m = MODULES.publications!;
    expect(resolvePeriod(m, {}, cycle).periodYear).toBe(2024);
  });

  it('rejects a nonsense year rather than storing it', () => {
    const m = MODULES.publications!;
    expect(resolvePeriod(m, { year: '9999' }, cycle).periodYear).toBe(2024);
    expect(resolvePeriod(m, { year: '2023' }, cycle).periodLabel).toBe('2023');
  });

  it('never stamps a record with a period outside the cycle', () => {
    // The Faculty Profile's only dates are a degree date and a joining date, neither
    // of which is a reporting period — it must still land inside the cycle.
    for (const m of MODULE_LIST) {
      const early = resolvePeriod(m, Object.fromEntries(
        m.fields.filter((f) => f.type === 'date').map((f) => [f.key, '1998-03-04']),
      ), cycle);
      expect(isInsideCycle(m, early.periodYear, cycle), `${m.key} resolved to ${early.periodLabel}`)
        .toBe(true);
    }
  });

  it('keeps the real year of a record its module refuses outside the cycle', () => {
    // Publications and Books & Chapters refuse such a record on submit, so its draft shows its
    // own year in the list instead of pretending to be from the cycle's last year.
    expect(resolvePeriod(MODULES.publications!, { year: '2019' }, cycle).periodLabel).toBe('2019');
    expect(resolvePeriod(MODULES.books!, { year: '2025' }, cycle).periodLabel).toBe('2025');
    // A module that only warns still lands inside the cycle.
    expect(resolvePeriod(MODULES.awards!, { awardYear: '2019' }, cycle).periodLabel).toBe('2024');
  });

  it('offers only in-cycle periods as filter options', () => {
    for (const m of MODULE_LIST) {
      const opts = periodOptions(m, cycle);
      expect(opts.length, `${m.key} has no period options`).toBeGreaterThan(0);
      for (const o of opts) expect(isInsideCycle(m, o.year, cycle)).toBe(true);
    }
  });
});
