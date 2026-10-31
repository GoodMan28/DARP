import { describe, it, expect } from 'vitest';
import {
  periodSourceField, resolvePeriod, yearsOf, yearOfPeriod, labelFor, isInsideCycle, periodOptions,
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

  it('prints the source field for all 25 modules — REVIEW THIS OUTPUT ONCE', () => {
    const table = MODULE_LIST.map((m) => {
      const src = periodSourceField(m);
      return `${m.key.padEnd(16)} ${m.periodType}  ${src ? `${src.kind}:${src.key}` : '(falls back to the cycle end)'}`;
    });
    console.error('\nPeriod source per module:\n' + table.join('\n'));
    expect(table).toHaveLength(25);
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
    expect(resolvePeriod(MODULES.awards!, { awardDate: '2019-06-01' }, cycle).periodLabel).toBe('2019');
    expect(resolvePeriod(MODULES.patents!, { statusDate: '2018-05-01' }, cycle).periodLabel).toBe('2018');
  });

  it('files a fellowship dated in February under the financial year before', () => {
    expect(resolvePeriod(MODULES.fellowships!, { awardDate: '2024-02-10', validityYears: '1' }, cycle).periodYear).toBe(2023);
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

  it('files a grant by the financial year of its sanction date', () => {
    const grants = MODULES.grants!;
    expect(resolvePeriod(grants, { sanctionDate: '2025-02-12' }, cycle).periodLabel).toBe('FY 2024-25');
    expect(resolvePeriod(grants, { sanctionDate: '2025-04-01' }, cycle).periodLabel).toBe('FY 2025-26');
  });

  it('uses the support date, not the conference dates, for financial support', () => {
    const m = MODULES.finsupport!;
    expect(resolvePeriod(m, { supportDate: '2023-05-10', startDate: '2021-01-01' }, cycle).periodLabel).toBe('FY 2023-24');
  });

  it('dates a patent by its publish/grant date, not its filing date', () => {
    const r = resolvePeriod(MODULES.patents!, { filedDate: '2021-05-01', statusDate: '2024-03-10' }, cycle);
    expect(r.periodYear).toBe(2024);
  });

  it('keeps all three year types for a dated record', () => {
    const r = resolvePeriod(MODULES.grants!, { sanctionDate: '2025-02-12' }, cycle);
    expect(r).toMatchObject({ cyYear: 2025, fyYear: 2024, ayYear: 2024 });
  });
});

describe('yearsOf', () => {
  it('places a date in all three year types', () => {
    expect(yearsOf({ date: '2024-03-31' }, 'CY')).toEqual({ cy: 2024, fy: 2023, ay: 2023 });
    expect(yearsOf({ date: '2024-04-01' }, 'CY').fy).toBe(2024);
    expect(yearsOf({ date: '2024-07-01' }, 'CY').ay).toBe(2024);
  });
  it('fills only the own type for a year alone', () => {
    expect(yearsOf({ year: 2024 }, 'FY')).toEqual({ cy: null, fy: 2024, ay: null });
    expect(yearsOf({ year: 2024 }, 'AY')).toEqual({ cy: null, fy: null, ay: 2024 });
  });
});
