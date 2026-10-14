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

  it("files a record under its own year, inside the cycle's window or not", () => {
    expect(resolvePeriod(MODULES.publications!, { year: '2019' }, cycle).periodLabel).toBe('2019');
    expect(resolvePeriod(MODULES.books!, { year: '2025' }, cycle).periodLabel).toBe('2025');
    expect(resolvePeriod(MODULES.awards!, { awardYear: '2019' }, cycle).periodLabel).toBe('2019');
    expect(resolvePeriod(MODULES.patents!, { filedDate: '2018-05-01' }, cycle).periodLabel).toBe('2018');
  });

  it("files the Faculty Profile under the cycle's last year: its dates are not reporting periods", () => {
    const m = MODULES.profile!;
    const dated = Object.fromEntries(m.fields.filter((f) => f.type === 'date').map((f) => [f.key, '1998-03-04']));
    expect(resolvePeriod(m, dated, cycle).periodLabel).toBe('AY 2024-25');
  });

  it('offers only in-cycle periods as filter options', () => {
    for (const m of MODULE_LIST) {
      const opts = periodOptions(m, cycle);
      expect(opts.length, `${m.key} has no period options`).toBeGreaterThan(0);
      for (const o of opts) expect(isInsideCycle(m, o.year, cycle)).toBe(true);
    }
  });
});
