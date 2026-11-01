import type { PeriodType, RecordStatus } from '@darp/shared/modules/types';
import type { CounterWindow, DeclaredCounterDef } from '@darp/shared/contracts';
import type { JournalRanking } from '@darp/shared/journals';
import { recordActive } from '@darp/shared/projectPeriod';
import { getModule } from '@darp/shared/modules';
import { isOutsideBit } from '@darp/shared/affiliation';

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
  /**
   * Count a stage of a record by that stage's own date, not by the record's year. Patents: one patent
   * filed in 2022, published in 2023 and granted in 2025 counts once as filed (2022), once as
   * published (2023) and once as granted (2025). The record must have reached the stage (`reachedBy`);
   * when the date is missing, a record still at the stage itself (`reachedBy[0]`) uses its own year.
   */
  stage?: { dateField: string; reachedBy: string[] };
  /** Only count papers whose journal ranking (worked out from the ISSN, never stored) passes this. */
  ranking?: (r: JournalRanking) => boolean;
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

/** Records within their validity on the day the figures are worked out (lifetime ones always are). */
function stillValid(mods: Array<[string, string]>): CounterDef[] {
  return mods.map(([moduleKey, label]) => C({
    key: `${moduleKey}.count.active`, label, moduleKey, metric: 'count', window: 'today', format: 'number',
  }));
}

const WOS_INDEXES = ['SCIE', 'SSCI', 'AHCI', 'ESCI'];
const TOP_HALF = ['Q1', 'Q2'];

/**
 * The 67 computed counters: the sheet's 49, patents filed, papers in conference proceedings, papers by their
 * journal's indexing and quartile, the awards still valid today, and outreach activities. These keys are
 * exactly the `feedsCounters` values declared across the 24 module configs — tests/unit/rollups.test.ts fails if the two ever drift.
 */
export const COUNTERS: CounterDef[] = [
  /* ── Publications ─────────────────────────────────────────── */
  ...both({
    keyBase: 'publications.count', moduleKey: 'publications', metric: 'count', format: 'number',
    label: 'Publications {CY}', labelSince: 'Publications since joining BIT',
  }),
  ...both({
    keyBase: 'publications.count.scopus', moduleKey: 'publications', metric: 'count', format: 'number',
    ranking: (r) => r.indexes.includes('Scopus'),
    label: 'Publications in Scopus-indexed journals {CY}', labelSince: 'Publications in Scopus-indexed journals since joining BIT',
  }),
  ...both({
    keyBase: 'publications.count.wos', moduleKey: 'publications', metric: 'count', format: 'number',
    ranking: (r) => r.indexes.some((i) => WOS_INDEXES.includes(i)),
    label: 'Publications in Web of Science journals {CY}', labelSince: 'Publications in Web of Science journals since joining BIT',
  }),
  ...both({
    keyBase: 'publications.count.q1q2', moduleKey: 'publications', metric: 'count', format: 'number',
    ranking: (r) => TOP_HALF.includes(r.sjrQuartile ?? '') || TOP_HALF.includes(r.jifQuartile ?? ''),
    label: 'Publications in Q1 or Q2 journals (SJR or JIF) {CY}', labelSince: 'Publications in Q1 or Q2 journals since joining BIT',
  }),

  /* ── Patents ──────────────────────────────────────────────── */
  ...both({
    keyBase: 'patents.count.filed', moduleKey: 'patents', metric: 'count', format: 'number',
    stage: { dateField: 'filedDate', reachedBy: ['Applied', 'Published', 'Granted'] },
    label: 'Patents filed {CY}', labelSince: 'Patents filed since joining BIT',
  }),
  ...both({
    keyBase: 'patents.count.published', moduleKey: 'patents', metric: 'count', format: 'number',
    stage: { dateField: 'publishedDate', reachedBy: ['Published', 'Granted'] },
    label: 'Patents published {CY}', labelSince: 'Patents published since joining BIT',
  }),
  ...both({
    keyBase: 'patents.count.granted', moduleKey: 'patents', metric: 'count', format: 'number',
    stage: { dateField: 'grantDate', reachedBy: ['Granted'] },
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
  // NAAC 3.4 counts papers in conference proceedings together with books and chapters.
  ...both({
    keyBase: 'books.count.conference', moduleKey: 'books', metric: 'count', format: 'number',
    filter: { field: 'publicationType', in: ['Conference paper'] },
    label: 'Papers in conference proceedings {CY}', labelSince: 'Papers in conference proceedings since joining BIT',
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
  ...stillValid([
    ['awards', 'Awards still valid today'],
    ['riawards', 'Research & innovation awards still valid today'],
    ['extawards', 'Extension-activity awards still valid today'],
    ['fellowships', 'Fellowships still valid today'],
  ]),

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

  /* ── Outreach activities ──────────────────────────────────── */
  ...both({
    keyBase: 'outreach.count', moduleKey: 'outreach', metric: 'count', format: 'number',
    label: 'Outreach activities (talks, reviews, examining, boards…), {CY}',
    labelSince: 'Outreach activities (talks, reviews, examining, boards…) since joining BIT',
  }),
  ...both({
    keyBase: 'outreach.count.outside', moduleKey: 'outreach', metric: 'count', format: 'number',
    filter: { field: 'where', in: ['Outside BIT'] },
    label: 'Outreach activities outside BIT, {CY}', labelSince: 'Outreach activities outside BIT since joining BIT',
  }),

  /* ── E-content ────────────────────────────────────────────── */
  ...both({
    keyBase: 'econtent.count', moduleKey: 'econtent', metric: 'count', format: 'number',
    label: 'E-content modules developed, {CY}',
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

/** A declared figure, with its name without the year and where DARP can count the same thing from records. */
export interface DeclaredDef extends DeclaredCounterDef {
  short: string;
  countedFrom?: { moduleKey: string; where?: Record<string, string[]>; note: string };
}

const SEMINAR_SUPPORT = { moduleKey: 'finsupport', note: 'Counted only where BIT gave financial support.' };
const FIN_PURPOSE = 'Conference/Workshop/Seminar/Symposium, etc';
const seminars = (type: 'National' | 'International') =>
  ({ ...SEMINAR_SUPPORT, where: { purpose: [FIN_PURPOSE], type: [type] } });
const WORKSHOPS = { moduleKey: 'fdpattended', note: 'Counted from your FDPs Attended.' };
const PAPERS = { moduleKey: 'books', where: { publicationType: ['Conference paper'] }, note: 'All conference papers: not split by national and international.' };

export const DECLARED_COUNTERS: DeclaredDef[] = [
  { key: 'manual.seminars.national.sinceJoining', short: 'National seminars attended', countedFrom: seminars('National'), label: 'National seminars attended since joining BIT', help: 'Seminars, conferences and workshops are told apart by the name of the programme.', format: 'number' },
  { key: 'manual.seminars.international.sinceJoining', short: 'International seminars attended', countedFrom: seminars('International'), label: 'International seminars attended since joining BIT', help: '', format: 'number' },
  { key: 'manual.workshops.attended.sinceJoining', short: 'Workshops and conferences attended', countedFrom: WORKSHOPS, label: 'Workshops and conferences attended since joining BIT', help: '', format: 'number' },
  { key: 'manual.foreignVisits.count.sinceJoining', short: 'Foreign universities visited', label: 'Foreign universities visited since joining BIT', help: '', format: 'number' },
  { key: 'manual.papersPresented.national.sinceJoining', short: 'Papers presented at national conferences', countedFrom: PAPERS, label: 'Papers presented at national conferences since joining BIT', help: 'Conference presentations, not journal papers.', format: 'number' },
  { key: 'manual.papersPresented.international.sinceJoining', short: 'Papers presented at international conferences', countedFrom: PAPERS, label: 'Papers presented at international conferences since joining BIT', help: '', format: 'number' },
  { key: 'manual.collaborators.active', short: 'Active research collaborators (total)', label: 'Total number of active research collaborators', help: '', format: 'number' },
  { key: 'manual.seminars.national.cycle', short: 'National seminars attended', countedFrom: seminars('National'), label: 'National seminars attended last year ({lastAY})', help: '', format: 'number' },
  { key: 'manual.seminars.international.cycle', short: 'International seminars attended', countedFrom: seminars('International'), label: 'International seminars attended last year ({lastAY})', help: '', format: 'number' },
  { key: 'manual.workshops.attended.cycle', short: 'Workshops and conferences attended', countedFrom: WORKSHOPS, label: 'Workshops and conferences attended last year ({lastAY})', help: '', format: 'number' },
  { key: 'manual.foreignVisits.lastYear', short: 'Visited a foreign university', label: 'Visited a foreign university last year ({lastAY})?', help: '', format: 'yesno' },
  { key: 'manual.papersPresented.national.cycle', short: 'Papers presented at national conferences', countedFrom: PAPERS, label: 'Papers presented at national conferences last year ({lastCY})', help: '', format: 'number' },
  { key: 'manual.papersPresented.international.cycle', short: 'Papers presented at international conferences', countedFrom: PAPERS, label: 'Papers presented at international conferences last year ({lastCY})', help: '', format: 'number' },
];

/**
 * A declared figure for "last year" is kept for that year: the same question asked about another
 * year is another figure. Its stored key is `<key>@<year>` (the year it starts in); a figure for
 * "since joining" or a plain total keeps its key. null for a figure that is not about one year.
 */
export function declaredYearType(c: DeclaredCounterDef): 'CY' | 'AY' | null {
  return c.label.includes('{lastAY}') ? 'AY' : c.label.includes('{lastCY}') ? 'CY' : null;
}

/** The key a declared figure is stored under for a range (see declaredYearType). */
export function declaredStorageKey(c: DeclaredCounterDef, b: CycleBounds, today = new Date()): string {
  const t = declaredYearType(c);
  return t ? `${c.key}@${lastYearOf(b, t, today)}` : c.key;
}


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
  /** A paper's journal ranking, for the counters that need one. */
  ranking?: JournalRanking;
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
 * The last year of a type that has ended by `today`, named by the year it starts in. On 30 October
 * 2026: CY 2025, FY 2025-26 (ended 31 March 2026), AY 2025-26 (ended 30 June 2026).
 */
export function lastCompletedYear(type: PeriodType, today = new Date()): number {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  if (type === 'CY') return y - 1;
  if (type === 'FY') return m >= 4 ? y - 1 : y - 2;
  return m >= 7 ? y - 1 : y - 2;
}

/**
 * "Last year" for a range, as the Faculty Profile sheet means it: the range's last year, but never
 * a year still running (a range ending 2026, read in October 2026, gives AY 2025-26, not AY 2026-27).
 */
export function lastYearOf(b: CycleBounds, type: 'CY' | 'AY', today = new Date()): number {
  return Math.min(b[type][1], lastCompletedYear(type, today));
}

/**
 * Labels name the chosen years through placeholders, so no year is written into the catalogue.
 * A financial or academic year is named by the year it starts in, so 2022 to 2024 covers
 * FY 2022-23, 2023-24 and 2024-25 (1 April 2022 to 31 March 2025):
 *   {CY} 2022–2024 · {FY} FY 2022-23 to 2024-25 · {AY} AY 2022-23 to 2024-25 · {lastAY} AY 2024-25 · {lastCY} CY 2024
 * {lastAY} and {lastCY} are the last completed year in the range (see lastYearOf).
 */
export function withCycleYears(label: string, b: CycleBounds, today = new Date()): string {
  const yy = (y: number) => String(y % 100).padStart(2, '0');
  const span = (type: 'FY' | 'AY', [from, to]: [number, number]) => (from === to
    ? `${type} ${from}-${yy(from + 1)}`
    : `${type} ${from}-${yy(from + 1)} to ${to}-${yy(to + 1)}`);
  return label
    .replace(/\{CY\}/g, b.CY[0] === b.CY[1] ? String(b.CY[0]) : `${b.CY[0]}–${b.CY[1]}`)
    .replace(/\{FY\}/g, span('FY', b.FY))
    .replace(/\{AY\}/g, span('AY', b.AY))
    .replace(/\{lastAY\}/g, () => { const y = lastYearOf(b, 'AY', today); return `AY ${y}-${yy(y + 1)}`; })
    .replace(/\{lastCY\}/g, () => `CY ${lastYearOf(b, 'CY', today)}`);
}

/** The year a record reached the counter's stage, or null when it has not reached it. */
function stageYear(def: CounterDef, r: CountableRecord, type: PeriodType): number | null {
  if (!def.stage) return r.periodYear;
  const status = typeof r.data.status === 'string' ? r.data.status : '';
  if (!def.stage.reachedBy.includes(status)) return null;
  const d = r.data[def.stage.dateField];
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    const y = Number(d.slice(0, 4));
    const m = Number(d.slice(5, 7));
    if (type === 'FY') return m >= 4 ? y : y - 1;
    if (type === 'AY') return m >= 7 ? y : y - 1;
    return y;
  }
  return status === def.stage.reachedBy[0] ? r.periodYear : null;
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
  today = new Date(),
): Record<string, number> {
  // Work its owner says was not done while at BIT stays in their modules but is not counted.
  const counted = recordsIn.filter((r) => COUNTED_STATUSES.includes(r.status) && !isOutsideBit(getModule(r.moduleKey), r.data));
  const out: Record<string, number> = {};

  for (const def of COUNTERS) {
    let total = 0;
    for (const r of counted) {
      if (r.moduleKey !== def.moduleKey) continue;
      if (!matchesFilter(def, r.data)) continue;
      if (def.ranking && !(r.ranking && def.ranking(r.ranking))) continue;
      if (def.window === 'today') {
        if (!recordActive(def.moduleKey, r.data, today)) continue;
        total += 1;
        continue;
      }
      const year = stageYear(def, r, periodTypeOf(def.moduleKey));
      if (year === null) continue;
      if (def.window === 'cycle') {
        const [from, to] = bounds[periodTypeOf(def.moduleKey)];
        if (year < from || year > to) continue;
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
