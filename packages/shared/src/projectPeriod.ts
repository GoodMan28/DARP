// Spans worked out from a start date and a duration in years: a grant's project period, an MoU's or an
// award's expiry. Pure functions, shared by the form (as you type) and the server (lists, exports,
// counters), so they always agree.

export type SpanKind = 'projectPeriod' | 'validUntil';

/**
 * Which fields hold the start date and the duration, per module. `lifetime` names a checkbox that, when
 * ticked, means the span never ends (an award valid for life); the duration is then not asked for.
 */
export const SPAN_MODULES: Record<string, { from: string; years: string; kind: SpanKind; lifetime?: string }> = {
  grants: { from: 'sanctionDate', years: 'durationYears', kind: 'projectPeriod' },
  mous: { from: 'signingDate', years: 'durationYears', kind: 'validUntil' },
  awards: { from: 'awardDate', years: 'validityYears', kind: 'validUntil', lifetime: 'validForLife' },
  riawards: { from: 'awardDate', years: 'validityYears', kind: 'validUntil', lifetime: 'validForLife' },
  extawards: { from: 'awardDate', years: 'validityYears', kind: 'validUntil', lifetime: 'validForLife' },
  fellowships: { from: 'awardDate', years: 'validityYears', kind: 'validUntil', lifetime: 'validForLife' },
};

/** A duration in years (3, '3', '1.5'), or null when it is missing or not a positive number. */
function yearsOf(v: unknown): number | null {
  const n = Number(String(v ?? '').trim() || NaN);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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

const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * The last day something is valid: the start plus the years, less one day (2024-03-15 + 2 years →
 * 2026-03-14). 'lifetime' when it never ends; null while the date or the duration is missing.
 */
export function validUntil(date: unknown, years: unknown, lifetime = false): Date | 'lifetime' | null {
  if (lifetime) return 'lifetime';
  const start = new Date(String(date ?? ''));
  const n = yearsOf(years);
  if (Number.isNaN(start.getTime()) || n === null) return null;
  return spanEnd(start, n);
}

/** Still valid on `today` (one valid for life always is). False when the date or the duration is missing. */
export function isActive(date: unknown, years: unknown, lifetime = false, today = new Date()): boolean {
  if (Number.isNaN(new Date(String(date ?? '')).getTime())) return false;
  const end = validUntil(date, years, lifetime);
  return end === 'lifetime' || (end !== null && end.getTime() >= startOfDay(today));
}

/** "11-02-2030", "11-02-2030 (expired)" once that day has passed, "Lifetime", or '' while an input is missing. */
export function validUntilText(date: unknown, years: unknown, today = new Date(), lifetime = false): string {
  const end = validUntil(date, years, lifetime);
  if (end === 'lifetime') return 'Lifetime';
  if (end === null) return '';
  return end.getTime() < startOfDay(today) ? `${dmy(end)} (expired)` : dmy(end);
}

const forLife = (s: { lifetime?: string }, data: Record<string, unknown>) => !!s.lifetime && data[s.lifetime] === true;

/** The text for a module's span column, '' for a module that has none. */
export function spanText(moduleKey: string, data: Record<string, unknown>): string {
  const s = SPAN_MODULES[moduleKey];
  if (!s) return '';
  return s.kind === 'projectPeriod'
    ? projectPeriodText(data[s.from], data[s.years])
    : validUntilText(data[s.from], data[s.years], new Date(), forLife(s, data));
}

/**
 * The text for a module's span column in a list or an export. A record saved before the date or the
 * validity was asked for says which one is missing, rather than showing nothing.
 */
export function spanColumnText(moduleKey: string, data: Record<string, unknown>): string {
  const text = spanText(moduleKey, data);
  const s = SPAN_MODULES[moduleKey];
  if (text || !s) return text;
  if (!String(data[s.from] ?? '').trim()) return 'Date not given';
  if (!String(data[s.years] ?? '').trim()) return s.lifetime ? 'Validity not given' : 'Duration not given';
  return '—';
}

/** Is the record still valid today? Only for a module with a "valid until" span. */
export function recordActive(moduleKey: string, data: Record<string, unknown>, today = new Date()): boolean {
  const s = SPAN_MODULES[moduleKey];
  return !!s && s.kind === 'validUntil' && isActive(data[s.from], data[s.years], forLife(s, data), today);
}
