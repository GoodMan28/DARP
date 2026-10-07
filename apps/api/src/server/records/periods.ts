import type { ModuleConfig, PeriodType } from '@darp/shared/modules/types';

export interface CycleWindows {
  id: string;
  cyStart: string; cyEnd: string;
  fyStart: string; fyEnd: string;
  ayStart: string; ayEnd: string;
}

/**
 * Which field supplies the record's reporting period, resolved by convention so that
 * no module config has to declare it:
 *   1. a field whose type is 'year'
 *   2. otherwise the first field whose type is 'date'
 *   3. otherwise null — the record is stamped with the cycle's final year
 */
export function periodSourceField(m: ModuleConfig): { key: string; kind: 'year' | 'date' } | null {
  const year = m.fields.find((f) => f.type === 'year');
  if (year) return { key: year.key, kind: 'year' };
  const date = m.fields.find((f) => f.type === 'date');
  if (date) return { key: date.key, kind: 'date' };
  return null;
}

/** Financial and academic years start in April and July respectively (Indian convention). */
export function yearOfPeriod(d: Date, type: PeriodType): number {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-based
  if (type === 'CY') return y;
  if (type === 'FY') return m >= 3 ? y : y - 1;   // April = month 3
  return m >= 6 ? y : y - 1;                       // AY starts July
}

export function labelFor(year: number, type: PeriodType): string {
  if (type === 'CY') return String(year);
  const next = String(year + 1).slice(-2);
  return type === 'FY' ? `FY ${year}-${next}` : `AY ${year}-${next}`;
}

export function resolvePeriod(
  m: ModuleConfig, data: Record<string, unknown>, cycle: CycleWindows,
): { periodYear: number; periodLabel: string } {
  const src = periodSourceField(m);
  let year: number | null = null;

  if (src) {
    const raw = data[src.key];
    if (src.kind === 'year' && raw != null && raw !== '') {
      const n = Number(String(raw));
      if (Number.isInteger(n) && n >= 1950 && n <= 2100) {
        year = n;   // a typed year is already the period's starting year
      }
    } else if (src.kind === 'date' && typeof raw === 'string' && raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) year = yearOfPeriod(d, m.periodType);
    }
  }

  const endYear = yearOfPeriod(
    new Date(m.periodType === 'CY' ? cycle.cyEnd : m.periodType === 'FY' ? cycle.fyEnd : cycle.ayEnd),
    m.periodType,
  );

  // No usable date, or a date outside the cycle: the record was entered during this
  // cycle, so it belongs to it. Faculty Profile is the clearest case — its only dates
  // are a degree date and a joining date, neither of which is a reporting period.
  if (year === null || !isInsideCycle(m, year, cycle)) {
    year = endYear;
  }

  return { periodYear: year, periodLabel: labelFor(year, m.periodType) };
}

/** Is a record's period inside the cycle's window for its module? Used to warn, not to block. */
export function isInsideCycle(m: ModuleConfig, periodYear: number, cycle: CycleWindows): boolean {
  const { from, to } = cycleYears(m, cycle);
  return periodYear >= from && periodYear <= to;
}

/** The first and last period years of the cycle for this module, e.g. 2022 and 2024. */
export function cycleYears(m: ModuleConfig, cycle: CycleWindows): { from: number; to: number } {
  const startKey = m.periodType === 'CY' ? cycle.cyStart : m.periodType === 'FY' ? cycle.fyStart : cycle.ayStart;
  const endKey = m.periodType === 'CY' ? cycle.cyEnd : m.periodType === 'FY' ? cycle.fyEnd : cycle.ayEnd;
  return {
    from: yearOfPeriod(new Date(startKey), m.periodType),
    to: yearOfPeriod(new Date(endKey), m.periodType),
  };
}

/** Every period a module may report in, newest first — used by the list filters. */
export function periodOptions(m: ModuleConfig, cycle: CycleWindows): Array<{ year: number; label: string }> {
  const startKey = m.periodType === 'CY' ? cycle.cyStart : m.periodType === 'FY' ? cycle.fyStart : cycle.ayStart;
  const endKey = m.periodType === 'CY' ? cycle.cyEnd : m.periodType === 'FY' ? cycle.fyEnd : cycle.ayEnd;
  const from = yearOfPeriod(new Date(startKey), m.periodType);
  const to = yearOfPeriod(new Date(endKey), m.periodType);
  const out: Array<{ year: number; label: string }> = [];
  for (let y = to; y >= from; y--) out.push({ year: y, label: labelFor(y, m.periodType) });
  return out;
}
