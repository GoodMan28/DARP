// Views of a module's records: which columns, which conditions, what order, how grouped. Shared by the
// page (which builds one) and the server (which checks it and turns it into SQL), so they never disagree.

export type ColumnKind =
  | 'text' | 'select' | 'multi' | 'number' | 'date' | 'year' | 'bool' | 'file'
  | 'indexing' | 'quartile' | 'jif' | 'valid';

export interface ViewColumn {
  /** A field key; '@owner', '@department', '@status', '@year', '@cy', '@fy', '@ay', '@updated' are the record's own facts. */
  key: string;
  label: string;
  kind: ColumnKind;
  /** The choices of a select, status or department column, and of Indexing and the quartiles. */
  options?: Array<{ value: string; label: string }>;
  /** A record's own fact (Entered by, Department…): filterable but not a column of the list. */
  meta?: boolean;
  /** Worked out from the journal's ISSN or the dates, never stored. */
  derived?: boolean;
  sortable: boolean;
  groupable: boolean;
}

export type Op =
  | 'contains' | 'notContains' | 'is' | 'isNot' | 'startsWith' | 'isEmpty' | 'isNotEmpty'
  | 'isAnyOf' | 'isNoneOf' | 'hasAnyOf' | 'hasAllOf' | 'hasNoneOf'
  | 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'between' | 'lastDays'
  | 'isTrue' | 'isFalse' | 'hasFile' | 'noFile'
  | 'validToday' | 'expired' | 'lifetime';

export const OPS: Record<ColumnKind, Op[]> = {
  text: ['contains', 'notContains', 'is', 'isNot', 'startsWith', 'isEmpty', 'isNotEmpty'],
  select: ['is', 'isNot', 'isAnyOf', 'isNoneOf', 'isEmpty', 'isNotEmpty'],
  multi: ['hasAnyOf', 'hasAllOf', 'hasNoneOf', 'isEmpty'],
  number: ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'between', 'isEmpty'],
  date: ['eq', 'lt', 'gt', 'between', 'lastDays', 'isEmpty'],
  year: ['eq', 'lt', 'gt', 'between'],
  bool: ['isTrue', 'isFalse'],
  file: ['hasFile', 'noFile'],
  indexing: ['hasAnyOf', 'hasNoneOf'],
  quartile: ['isAnyOf', 'isNoneOf'],
  jif: ['gte', 'lte', 'between', 'isEmpty'],
  valid: ['validToday', 'expired', 'lifetime', 'lt', 'gt'],
};

/** How many values an operator takes: none, one, two (between), a list, or a number of days. */
export type Shape = 'none' | 'one' | 'two' | 'many' | 'days';
export function shapeOf(op: Op): Shape {
  if (['isEmpty', 'isNotEmpty', 'isTrue', 'isFalse', 'hasFile', 'noFile', 'validToday', 'expired', 'lifetime'].includes(op)) return 'none';
  if (['isAnyOf', 'isNoneOf', 'hasAnyOf', 'hasAllOf', 'hasNoneOf'].includes(op)) return 'many';
  if (op === 'between') return 'two';
  if (op === 'lastDays') return 'days';
  return 'one';
}

const OP_WORDS: Record<Op, string> = {
  contains: 'contains', notContains: 'does not contain', is: 'is', isNot: 'is not', startsWith: 'starts with',
  isEmpty: 'is empty', isNotEmpty: 'is not empty', isAnyOf: 'is any of', isNoneOf: 'is none of',
  hasAnyOf: 'has any of', hasAllOf: 'has all of', hasNoneOf: 'has none of',
  eq: '=', neq: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥', between: 'is between', lastDays: 'is in the last',
  isTrue: 'is ticked', isFalse: 'is not ticked', hasFile: 'has a file', noFile: 'has no file',
  validToday: 'is valid today', expired: 'has expired', lifetime: 'is for life',
};

/** The wording of an operator for a column: dates and years read "is", "is before", "is after". */
export function opLabel(op: Op, kind: ColumnKind): string {
  if (kind === 'date' || kind === 'year') {
    if (op === 'eq') return 'is';
    if (op === 'lt') return 'is before';
    if (op === 'gt') return 'is after';
  }
  if (kind === 'valid') {
    if (op === 'lt') return 'ends before';
    if (op === 'gt') return 'ends after';
  }
  return OP_WORDS[op];
}

export interface Condition {
  field: string;
  op: Op;
  /** One value for a single-value operator, several for a list. */
  value?: string[];
  /** The upper end of "between". */
  value2?: string;
}
export interface ConditionGroup {
  join: 'and' | 'or';
  items: Condition[];
}
export interface FilterGroup {
  join: 'and' | 'or';
  items: Array<Condition | ConditionGroup>;
}
export const isGroup = (x: Condition | ConditionGroup): x is ConditionGroup => 'items' in x;

export interface SortKey { field: string; dir: 'asc' | 'desc' }

export interface ViewState {
  filter: FilterGroup;
  /** Up to three, applied in order. */
  sort: SortKey[];
  /** The columns shown, in order; null for the module's usual ones. */
  cols: string[] | null;
  groupBy: string | null;
}

export const EMPTY_VIEW: ViewState = { filter: { join: 'and', items: [] }, sort: [], cols: null, groupBy: null };

export const MAX_CONDITIONS = 20;
export const MAX_LIST = 50;
export const MAX_TEXT = 200;
export const EXPORT_LIMIT = 10_000;

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const isNum = (s: string) => /^-?\d+(\.\d+)?$/.test(s.trim());

/**
 * Does the value fit the column's kind: a number, a date, or any text? A choice need not be one of today's
 * options: a dropdown option IQAC later removed still filters (and finds nothing) rather than being dropped,
 * which would quietly show everything.
 */
function valueFits(kind: ColumnKind, v: string): boolean {
  if (!v || v.length > MAX_TEXT) return false;
  if (kind === 'number' || kind === 'year' || kind === 'jif') return isNum(v);
  if (kind === 'date' || kind === 'valid') return isDate(v);
  return true;
}

/** A condition fit to run: a known column, an operator it offers, and the values the operator needs. */
export function completeCondition(c: Condition, cols: Map<string, ViewColumn>): boolean {
  const col = cols.get(c.field);
  if (!col || !OPS[col.kind].includes(c.op)) return false;
  const shape = shapeOf(c.op);
  const v = c.value ?? [];
  // For "valid" columns, lt/gt compare dates; for the others a single value of the column's kind.
  const kind: ColumnKind = col.kind === 'valid' && (c.op === 'lt' || c.op === 'gt') ? 'date' : col.kind;
  switch (shape) {
    case 'none': return true;
    case 'one': return v.length >= 1 && valueFits(kind, v[0]!);
    case 'two': return v.length >= 1 && valueFits(kind, v[0]!) && !!c.value2 && valueFits(kind, c.value2);
    case 'many': return v.length >= 1 && v.every((x) => valueFits(kind, x));
    case 'days': return v.length >= 1 && /^\d{1,4}$/.test(v[0]!) && Number(v[0]) >= 1;
  }
}

const str = (x: unknown) => (typeof x === 'string' ? x.slice(0, MAX_TEXT) : '');

function readCondition(raw: unknown): Condition | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const field = str(o.field);
  const op = str(o.op) as Op;
  if (!field || !(op in OP_WORDS)) return null;
  const value = Array.isArray(o.value) ? o.value.slice(0, MAX_LIST).map(str).filter(Boolean) : typeof o.value === 'string' ? [str(o.value)] : [];
  return { field, op, ...(value.length ? { value } : {}), ...(typeof o.value2 === 'string' && o.value2 ? { value2: str(o.value2) } : {}) };
}

/**
 * Reads anything handed over (an address, a saved view, a request body) as a view for these columns.
 * Never throws: what does not fit is left out (an unknown column, an operator the column does not offer, a
 * condition still waiting for its value), so a stale address after a form changes still opens.
 */
export function cleanView(raw: unknown, columns: ViewColumn[]): ViewState {
  const cols = new Map(columns.map((c) => [c.key, c]));
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const f = (o.filter && typeof o.filter === 'object' ? o.filter : {}) as Record<string, unknown>;
  let budget = MAX_CONDITIONS;
  const take = (c: Condition | null): Condition | null => {
    if (!c || budget <= 0 || !completeCondition(c, cols)) return null;
    budget -= 1;
    return c;
  };
  const items: FilterGroup['items'] = [];
  for (const it of Array.isArray(f.items) ? f.items : []) {
    if (it && typeof it === 'object' && Array.isArray((it as ConditionGroup).items)) {
      const g = it as ConditionGroup;
      const inner = g.items.map((c) => take(readCondition(c))).filter((c): c is Condition => c !== null);
      if (inner.length) items.push({ join: g.join === 'or' ? 'or' : 'and', items: inner });
    } else {
      const c = take(readCondition(it));
      if (c) items.push(c);
    }
  }
  const sort = (Array.isArray(o.sort) ? o.sort : []).flatMap((s): SortKey[] => {
    const k = s as Record<string, unknown>;
    return cols.get(str(k.field))?.sortable ? [{ field: str(k.field), dir: k.dir === 'desc' ? 'desc' : 'asc' }] : [];
  }).filter((s, i, a) => a.findIndex((x) => x.field === s.field) === i).slice(0, 3);
  const shown = Array.isArray(o.cols) ? o.cols.map(str).filter((k) => cols.has(k) && !cols.get(k)!.meta) : [];
  const groupBy = cols.get(str(o.groupBy))?.groupable ? str(o.groupBy) : null;
  return { filter: { join: f.join === 'or' ? 'or' : 'and', items }, sort, cols: shown.length ? [...new Set(shown)] : null, groupBy };
}

/** How many conditions a view holds. */
export function conditionCount(v: ViewState): number {
  return v.filter.items.reduce((n, it) => n + (isGroup(it) ? it.items.length : 1), 0);
}

/** Is this the plain view: no conditions, sort, grouping or chosen columns? */
export function isPlain(v: ViewState): boolean {
  return conditionCount(v) === 0 && v.sort.length === 0 && v.cols === null && v.groupBy === null;
}

/** A view for an address: '' for the plain view. */
export function encodeView(v: ViewState): string {
  return isPlain(v) ? '' : JSON.stringify(v);
}

/** The view an address holds ('' or damaged text gives the plain view). */
export function decodeView(text: string | null | undefined, columns: ViewColumn[]): ViewState {
  if (!text) return EMPTY_VIEW;
  try { return cleanView(JSON.parse(text) as unknown, columns); } catch { return EMPTY_VIEW; }
}

/** The filter and sort in words, for the "About this export" sheet and the page: "Year is between 2022 and 2024, and (…)". */
export function describeView(v: ViewState, columns: ViewColumn[]): string {
  const cols = new Map(columns.map((c) => [c.key, c]));
  const say = (c: Condition): string => {
    const col = cols.get(c.field)!;
    const label = (x: string) => col.options?.find((o) => o.value === x)?.label ?? x;
    const vals = (c.value ?? []).map(label);
    const op = opLabel(c.op, col.kind);
    switch (shapeOf(c.op)) {
      case 'none': return `${col.label} ${op}`;
      case 'one': return `${col.label} ${op} ${vals[0]}`;
      case 'two': return `${col.label} ${op} ${vals[0]} and ${c.value2}`;
      case 'days': return `${col.label} ${op} ${vals[0]} days`;
      case 'many': return `${col.label} ${op} ${vals.length > 1 ? `${vals.slice(0, -1).join(', ')} or ${vals[vals.length - 1]}` : vals[0]}`;
    }
  };
  const parts = v.filter.items.map((it) => (isGroup(it) ? `(${it.items.map(say).join(` ${it.join} `)})` : say(it)));
  const filter = parts.join(` ${v.filter.join} `);
  const order = v.sort.map((s) => `${cols.get(s.field)?.label ?? s.field} ${s.dir === 'desc' ? 'high to low' : 'low to high'}`).join(', ');
  return [filter && `Where ${filter}`, order && `Sorted by ${order}`, v.groupBy && `Grouped by ${cols.get(v.groupBy)?.label ?? v.groupBy}`]
    .filter(Boolean).join('. ');
}

/** A saved view, as listed in the Views menu. */
export interface SavedView {
  id: string;
  name: string;
  /** Saved by IQAC for everyone with access to the module. */
  shared: boolean;
  /** The caller may change or delete it. */
  mine: boolean;
  ownerName: string;
  view: ViewState;
}
