import type { PeriodType, RecordStatus } from '@darp/shared/modules/types';
import type { CounterWindow, DeclaredCounterDef } from '@darp/shared/contracts';

export type { CounterWindow, DeclaredCounterDef };

/* ══════════════════════════ the catalogue ══════════════════════════ */

export type CounterMetric = 'count' | 'sum';

export interface CounterDef {
  key: string;
  /** Wording taken from the Faculty Profile sheet. */
  label: string;
  moduleKey: string;
  metric: CounterMetric;
  window: CounterWindow;
  /** For `sum`: which field to add up (a `money` field, stored as digits). */
  sumField?: string;
  /** Only count records whose field is one of these values. */
  filter?: { field: string; in: string[] };
  /** How to show it: a plain number or rupees. */
  format: 'number' | 'money';
}

const C = (d: CounterDef): CounterDef => d;

/** Helper: the same counter for both windows. */
function both(
  base: Omit<CounterDef, 'key' | 'window' | 'label'>
    & { keyBase: string; label: string; labelSince: string },
): CounterDef[] {
  const { keyBase, label, labelSince, ...rest } = base;
  return [
    C({ ...rest, key: `${keyBase}.cycle`, window: 'cycle', label }),
    C({ ...rest, key: `${keyBase}.sinceJoining`, window: 'sinceJoining', label: labelSince }),
  ];
}

/**
 * The 49 computed counters. These keys are exactly the `feedsCounters` values declared
 * across the 24 module configs — tests/unit/rollups.test.ts fails if the two ever drift.
 */
export const COUNTERS: CounterDef[] = [
  /* ── Publications ─────────────────────────────────────────── */
  ...both({
    keyBase: 'publications.count', moduleKey: 'publications', metric: 'count', format: 'number',
    label: 'Publications {CY}', labelSince: 'Publications since joining BIT',
  }),

  /* ── Patents ──────────────────────────────────────────────── */
  ...both({
    keyBase: 'patents.count.published', moduleKey: 'patents', metric: 'count', format: 'number',
    filter: { field: 'status', in: ['Published'] },
    label: 'Patents published {CY}', labelSince: 'Patents published since joining BIT',
  }),
  ...both({
    keyBase: 'patents.count.granted', moduleKey: 'patents', metric: 'count', format: 'number',
    filter: { field: 'status', in: ['Awarded/Granted'] },
    label: 'Patents granted {CY}', labelSince: 'Patents granted since joining BIT',
  }),

  /* ── Books and chapters ───────────────────────────────────── */
  ...both({
    keyBase: 'books.count.book', moduleKey: 'books', metric: 'count', format: 'number',
    filter: { field: 'publicationType', in: ['Book'] },
    label: 'Books published {CY}', labelSince: 'Books published since joining BIT',
  }),
  ...both({
    keyBase: 'books.count.chapter', moduleKey: 'books', metric: 'count', format: 'number',
    filter: { field: 'publicationType', in: ['Book chapter'] },
    label: 'Book chapters {CY}', labelSince: 'Book chapters since joining BIT',
  }),

  /* ── Funds and grants ─────────────────────────────────────── */
  ...both({
    keyBase: 'grants.count.pi', moduleKey: 'grants', metric: 'count', format: 'number',
    filter: { field: 'role', in: ['PI'] },
    label: 'Research projects as PI, {FY}', labelSince: 'Research projects as PI since joining BIT',
  }),
  ...both({
    keyBase: 'grants.sum.pi', moduleKey: 'grants', metric: 'sum', sumField: 'amount', format: 'money',
    filter: { field: 'role', in: ['PI'] },
    label: 'Sanctioned amount as PI, {FY}', labelSince: 'Sanctioned amount as PI since joining BIT',
  }),
  ...both({
    keyBase: 'grants.count.copi', moduleKey: 'grants', metric: 'count', format: 'number',
    filter: { field: 'role', in: ['Co-PI'] },
    label: 'Research projects as Co-PI, {FY}', labelSince: 'Research projects as Co-PI since joining BIT',
  }),
  ...both({
    keyBase: 'grants.sum.copi', moduleKey: 'grants', metric: 'sum', sumField: 'amount', format: 'money',
    filter: { field: 'role', in: ['Co-PI'] },
    label: 'Sanctioned amount as Co-PI, {FY}', labelSince: 'Sanctioned amount as Co-PI since joining BIT',
  }),

  /* ── Consultancy and corporate training ───────────────────── */
  ...both({
    keyBase: 'consultancy.count.consultancy', moduleKey: 'consultancy', metric: 'count', format: 'number',
    filter: { field: 'recordType', in: ['Consultancy'] },
    label: 'Consultancy projects, {FY}', labelSince: 'Consultancy projects since joining BIT',
  }),
  ...both({
    keyBase: 'consultancy.sum.consultancy', moduleKey: 'consultancy', metric: 'sum', sumField: 'revenue', format: 'money',
    filter: { field: 'recordType', in: ['Consultancy'] },
    label: 'Consultancy revenue, {FY}', labelSince: 'Consultancy revenue since joining BIT',
  }),
  ...both({
    keyBase: 'consultancy.count.training', moduleKey: 'consultancy', metric: 'count', format: 'number',
    filter: { field: 'recordType', in: ['Corporate training'] },
    label: 'Corporate training programmes, {FY}', labelSince: 'Corporate training programmes since joining BIT',
  }),
  ...both({
    keyBase: 'consultancy.sum.training', moduleKey: 'consultancy', metric: 'sum', sumField: 'revenue', format: 'money',
    filter: { field: 'recordType', in: ['Corporate training'] },
    label: 'Corporate training revenue, {FY}', labelSince: 'Corporate training revenue since joining BIT',
  }),

  /* ── Fellowships ──────────────────────────────────────────── */
  ...both({
    keyBase: 'fellowships.count', moduleKey: 'fellowships', metric: 'count', format: 'number',
    label: 'Fellowships / travel grants, {FY}', labelSince: 'Fellowships / travel grants since joining BIT',
  }),
  ...both({
    keyBase: 'fellowships.sum', moduleKey: 'fellowships', metric: 'sum', sumField: 'amount', format: 'money',
    label: 'Fellowship amount, {FY}', labelSince: 'Fellowship amount since joining BIT',
  }),

  /* ── Seed money (no "cycle" row exists in the sheet) ──────── */
  C({
    key: 'seedmoney.sum.sinceJoining', label: 'Total seed money received since joining BIT',
    moduleKey: 'seedmoney', metric: 'sum', sumField: 'amount', window: 'sinceJoining', format: 'money',
  }),

  /* ── Awards ───────────────────────────────────────────────── */
  ...both({
    keyBase: 'awards.count', moduleKey: 'awards', metric: 'count', format: 'number',
    label: 'Awards from state/national/international agencies, {CY}',
    labelSince: 'Awards from state/national/international agencies since joining BIT',
  }),
  ...both({
    keyBase: 'riawards.count', moduleKey: 'riawards', metric: 'count', format: 'number',
    label: 'Research & innovation awards {CY}',
    labelSince: 'Research & innovation awards since joining BIT',
  }),
  ...both({
    keyBase: 'extawards.count', moduleKey: 'extawards', metric: 'count', format: 'number',
    label: 'Extension-activity awards {CY}',
    labelSince: 'Extension-activity awards since joining BIT',
  }),

  /* ── Financial support (the sheet has only the window rows) ─ */
  C({
    key: 'finsupport.count.cycle', label: 'Times financial support received, {FY}',
    moduleKey: 'finsupport', metric: 'count', window: 'cycle', format: 'number',
  }),
  C({
    key: 'finsupport.sum.cycle', label: 'Amount of financial support received, {FY}',
    moduleKey: 'finsupport', metric: 'sum', sumField: 'amount', window: 'cycle', format: 'money',
  }),

  /* ── FDPs attended ────────────────────────────────────────── */
  ...both({
    keyBase: 'fdpattended.count', moduleKey: 'fdpattended', metric: 'count', format: 'number',
    label: 'FDPs / MDPs / refreshers attended {CY}',
    labelSince: 'FDPs / MDPs / refreshers attended since joining BIT',
  }),

  /* ── E-content ────────────────────────────────────────────── */
  ...both({
    keyBase: 'econtent.count', moduleKey: 'econtent', metric: 'count', format: 'number',
    label: 'E-content modules developed, {AY}',
    labelSince: 'E-content modules developed since joining BIT',
  }),

  /* ── Students guided ──────────────────────────────────────── */
  ...both({
    keyBase: 'studentsguided.count.ug', moduleKey: 'studentsguided', metric: 'count', format: 'number',
    filter: { field: 'level', in: ['UG'] },
    label: 'UG students guided, {AY}', labelSince: 'UG students guided since joining BIT',
  }),
  ...both({
    keyBase: 'studentsguided.count.pg', moduleKey: 'studentsguided', metric: 'count', format: 'number',
    filter: { field: 'level', in: ['PG'] },
    label: 'PG students guided, {AY}', labelSince: 'PG students guided since joining BIT',
  }),
  ...both({
    keyBase: 'studentsguided.count.phd', moduleKey: 'studentsguided', metric: 'count', format: 'number',
    filter: { field: 'level', in: ['PHD'] },
    label: 'Ph.D. students guided, {AY}', labelSince: 'Ph.D. students guided since joining BIT',
  }),
];

/* ─────────────────── the 13 declared counters ───────────────────
   The Faculty Profile sheet asks for these, but no workbook sheet collects
   the underlying detail, so they cannot be computed. The faculty member
   declares each one once; the value is stored in `profile_baselines`. */

export const DECLARED_COUNTERS: DeclaredCounterDef[] = [
  { key: 'manual.seminars.national.sinceJoining', label: 'National seminars attended since joining BIT', help: 'Seminars, conferences and workshops are told apart by the name of the programme.', format: 'number' },
  { key: 'manual.seminars.national.cycle', label: 'National seminars attended, {lastAY}', help: '', format: 'number' },
  { key: 'manual.seminars.international.sinceJoining', label: 'International seminars attended since joining BIT', help: '', format: 'number' },
  { key: 'manual.seminars.international.cycle', label: 'International seminars attended, {lastAY}', help: '', format: 'number' },
  { key: 'manual.workshops.attended.sinceJoining', label: 'Workshops and conferences attended since joining BIT', help: '', format: 'number' },
  { key: 'manual.workshops.attended.cycle', label: 'Workshops and conferences attended, {lastAY}', help: '', format: 'number' },
  { key: 'manual.foreignVisits.count.sinceJoining', label: 'Foreign universities visited since joining BIT', help: '', format: 'number' },
  { key: 'manual.foreignVisits.lastYear', label: 'Visited a foreign university in {lastAY}?', help: '', format: 'yesno' },
  { key: 'manual.papersPresented.national.sinceJoining', label: 'Papers presented at national conferences since joining BIT', help: 'Conference presentations, not journal papers.', format: 'number' },
  { key: 'manual.papersPresented.national.cycle', label: 'Papers presented at national conferences, {lastCY}', help: '', format: 'number' },
  { key: 'manual.papersPresented.international.sinceJoining', label: 'Papers presented at international conferences since joining BIT', help: '', format: 'number' },
  { key: 'manual.papersPresented.international.cycle', label: 'Papers presented at international conferences, {lastCY}', help: '', format: 'number' },
  { key: 'manual.collaborators.active', label: 'Total number of active research collaborators', help: '', format: 'number' },
];

export const ALL_COUNTER_KEYS: string[] = [
  ...COUNTERS.map((c) => c.key),
  ...DECLARED_COUNTERS.map((c) => c.key),
];

/** Every module key that feeds at least one computed counter. */
export const COUNTER_MODULE_KEYS: string[] = [...new Set(COUNTERS.map((c) => c.moduleKey))];

/* ══════════════════════ the computation engine ══════════════════════ */

export interface CountableRecord {
  moduleKey: string;
  periodYear: number;
  status: RecordStatus;
  data: Record<string, unknown>;
}

/** A draft is not a claim: only these statuses are ever counted on a profile tile. */
export const COUNTED_STATUSES: RecordStatus[] = ['submitted', 'verified', 'approved'];
/** Exports are stricter still — nothing unverified reaches an accreditation body. */
export const EXPORTABLE_STATUSES: RecordStatus[] = ['verified', 'approved'];

export interface CycleBounds {
  CY: [number, number];
  FY: [number, number];
  AY: [number, number];
}

/**
 * Labels name the cycle's years through placeholders, filled from the cycle IQAC has made active
 * (Administration → Reporting cycle), so no year is written into the catalogue:
 *   {CY} 2022–2024 · {FY} FY 2022-25 · {AY} AY 2022-25 · {lastAY} AY 2024-25 · {lastCY} CY 2024
 */
export function withCycleYears(label: string, b: CycleBounds): string {
  const yy = (y: number) => String(y % 100).padStart(2, '0');
  return label
    .replace(/\{CY\}/g, `${b.CY[0]}–${b.CY[1]}`)
    .replace(/\{FY\}/g, `FY ${b.FY[0]}-${yy(b.FY[1] + 1)}`)
    .replace(/\{AY\}/g, `AY ${b.AY[0]}-${yy(b.AY[1] + 1)}`)
    .replace(/\{lastAY\}/g, `AY ${b.AY[1]}-${yy(b.AY[1] + 1)}`)
    .replace(/\{lastCY\}/g, `CY ${b.CY[1]}`);
}

function matchesFilter(def: CounterDef, data: Record<string, unknown>): boolean {
  if (!def.filter) return true;
  const v = data[def.filter.field];
  return typeof v === 'string' && def.filter.in.includes(v);
}

/**
 * Money is whole rupees kept as a string of digits in JSONB. Separators are tolerated,
 * anything else yields 0 — a counter must never become NaN.
 */
function moneyOf(data: Record<string, unknown>, field: string): number {
  const raw = data[field];
  if (raw === undefined || raw === null || raw === '') return 0;
  const digits = String(raw).replace(/[^\d]/g, '');
  if (digits === '') return 0;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/**
 * Computes every derived counter for one person. Pure — unit-testable without a database.
 * `bounds` gives the cycle's first and last year per period type.
 * `periodTypeOf` maps a module key to its period type (from the registry).
 * `baselines` are the pre-portal figures added to every `sinceJoining` counter.
 */
export function computeCounters(
  recordsIn: CountableRecord[],
  bounds: CycleBounds,
  periodTypeOf: (moduleKey: string) => PeriodType,
  baselines: Record<string, number> = {},
): Record<string, number> {
  const counted = recordsIn.filter((r) => COUNTED_STATUSES.includes(r.status));
  const out: Record<string, number> = {};

  for (const def of COUNTERS) {
    let total = 0;
    for (const r of counted) {
      if (r.moduleKey !== def.moduleKey) continue;
      if (!matchesFilter(def, r.data)) continue;
      if (def.window === 'cycle') {
        const [from, to] = bounds[periodTypeOf(def.moduleKey)];
        if (r.periodYear < from || r.periodYear > to) continue;
      }
      if (def.metric === 'count') total += 1;
      else if (def.sumField) total += moneyOf(r.data, def.sumField);
    }
    // Pre-portal history only ever applies to "since joining" figures (locked decision #6).
    if (def.window === 'sinceJoining') total += baselines[def.key] ?? 0;
    out[def.key] = total;
  }

  return out;
}
