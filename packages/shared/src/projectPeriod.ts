// Spans worked out from a start date and a duration in years: a grant's project period, an MoU's expiry.
// Pure functions, shared by the form (as you type) and the server (lists), so the two always agree.

export type SpanKind = 'projectPeriod' | 'validUntil';

/** Which fields hold the start date and the duration, per module. */
export const SPAN_MODULES: Record<string, { from: string; years: string; kind: SpanKind }> = {
  grants: { from: 'sanctionDate', years: 'durationYears', kind: 'projectPeriod' },
  mous: { from: 'signingDate', years: 'durationYears', kind: 'validUntil' },
};

const pad = (n: number) => String(n).padStart(2, '0');

/** "12-02-2025" from a UTC date. */
function dmy(d: Date): string {
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/** The last day of the span: the start plus the years (halves allowed), less one day. */
export function spanEnd(start: Date, years: number): Date {
  const months = Math.round(years * 12);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - 1);
  return end;
}

function fyLabel(d: Date): string {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `FY ${y}-${String(y + 1).slice(-2)}`;
}

/** "12-02-2025 to 11-02-2028 (3 years) · FY 2024-25 to FY 2027-28", or '' while either input is missing. */
export function projectPeriodText(date: unknown, years: unknown): string {
  const start = new Date(String(date ?? ''));
  const n = Number(years);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(n) || n <= 0) return '';
  const end = spanEnd(start, n);
  return `${dmy(start)} to ${dmy(end)} (${n} ${n === 1 ? 'year' : 'years'}) · ${fyLabel(start)} to ${fyLabel(end)}`;
}

/** "11-02-2030", or "11-02-2030 (expired)" once that day has passed. */
export function validUntilText(date: unknown, years: unknown, today = new Date()): string {
  const start = new Date(String(date ?? ''));
  const n = Number(years);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(n) || n <= 0) return '';
  const end = spanEnd(start, n);
  return end.getTime() < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    ? `${dmy(end)} (expired)` : dmy(end);
}

/** The text for a module's span column, '' for a module that has none. */
export function spanText(moduleKey: string, data: Record<string, unknown>): string {
  const s = SPAN_MODULES[moduleKey];
  if (!s) return '';
  return s.kind === 'projectPeriod'
    ? projectPeriodText(data[s.from], data[s.years])
    : validUntilText(data[s.from], data[s.years]);
}
