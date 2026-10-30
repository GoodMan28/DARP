import { and, or, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '@/server/db';
import { records, users, departments } from '@/server/db/schema';
import type { ModuleConfig } from '@darp/shared/modules/types';
import {
  cleanView, isGroup, type ColumnKind, type Condition, type ViewColumn, type ViewState,
} from '@darp/shared/views';
import { SPAN_MODULES, validUntil } from '@darp/shared/projectPeriod';
import { STATUS_LABEL } from '@darp/shared/format';
import type { SessionUser } from '@/server/auth/session';
import { rankingsFor, rankingItemOf } from '@/server/journals/ranking';
import { scopeFilter } from './scope';
import { getAllLists } from './masterLists';

/*
 * A view of a module's records (filter, sort, group, shown columns) as SQL. The database does the work,
 * so it holds for ten thousand records as for ten, and paging stays right. Three guards:
 *  - only columns the module's config declares are accepted: a made-up name is dropped, never run;
 *  - values are always parameters, never part of the SQL text;
 *  - the result is ANDed with scopeFilter() by the caller, never used instead of it.
 * Aadhaar, PAN and any protected field are not columns at all.
 */

const QUARTILES = ['Q1', 'Q2', 'Q3', 'Q4', 'NA'];
const STATUSES = ['draft', 'submitted', 'verified', 'approved', 'returned'];
const opt = (v: string, label = v) => ({ value: v, label });

function kindOf(type: string): ColumnKind {
  if (type === 'select') return 'select';
  if (type === 'multiselect') return 'multi';
  if (type === 'integer' || type === 'money' || type === 'decimal') return 'number';
  if (type === 'date') return 'date';
  if (type === 'year') return 'year';
  if (type === 'checkbox') return 'bool';
  if (type === 'file') return 'file';
  return 'text';
}

/** The columns a person can filter, sort, group by and show for a module. */
export async function viewColumnsFor(m: ModuleConfig): Promise<ViewColumn[]> {
  const [lists, depts] = await Promise.all([
    getAllLists(),
    db.select({ id: departments.id, name: departments.name }).from(departments).orderBy(departments.name),
  ]);
  const cols: ViewColumn[] = [];
  for (const f of m.fields) {
    // Protected fields (Aadhaar, PAN, masked contact details) are never offered.
    if (f.pii || f.sensitive || f.type === 'pan' || f.type === 'aadhaar') continue;
    const kind = kindOf(f.type);
    const choices = f.listKey ? (lists[f.listKey] ?? []) : (f.options ?? []);
    cols.push({
      key: f.key, label: f.label, kind,
      ...(kind === 'select' ? { options: choices.map((c) => opt(c)) } : {}),
      sortable: kind !== 'file' && kind !== 'multi', groupable: kind === 'select' || kind === 'bool',
    });
  }
  const derived: Record<string, { kind: ColumnKind; options?: ViewColumn['options'] }> = {
    indexes: { kind: 'indexing', options: (lists.indexingTypes ?? []).map((c) => opt(c)) },
    sjrQuartile: { kind: 'quartile', options: QUARTILES.map((q) => opt(q)) },
    jifQuartile: { kind: 'quartile', options: QUARTILES.map((q) => opt(q)) },
    jif: { kind: 'jif' },
    ...(SPAN_MODULES[m.key]?.kind === 'validUntil' ? { validUntil: { kind: 'valid' as const } } : {}),
  };
  for (const d of m.derived ?? []) {
    const spec = derived[d.key];
    if (spec) cols.push({ key: d.key, label: d.label, kind: spec.kind, options: spec.options, derived: true, sortable: false, groupable: false });
  }
  const meta = (key: string, label: string, kind: ColumnKind, extra: Partial<ViewColumn> = {}): ViewColumn => ({
    key, label, kind, meta: true, sortable: true, groupable: false, ...extra,
  });
  cols.push(
    meta('@owner', 'Entered by', 'text', { groupable: true }),
    meta('@department', 'Department', 'select', { options: depts.map((d) => opt(d.id, d.name)), groupable: true }),
    meta('@status', 'Status', 'select', { options: STATUSES.map((s) => opt(s, STATUS_LABEL[s] ?? s)), groupable: true }),
    meta('@year', 'Reporting year', 'year', { groupable: true }),
    meta('@cy', 'Calendar year', 'year'),
    meta('@fy', 'Financial year (starting year)', 'year'),
    meta('@ay', 'Academic year (starting year)', 'year'),
    meta('@updated', 'Last updated', 'date'),
  );
  return cols;
}

/* ───────────────────────────── SQL pieces ───────────────────────────── */

const text = (key: string) => sql`(${records.data} ->> ${key})`;
const asNumber = (e: SQL) => sql`(case when ${e} ~ '^-?[0-9]+([.][0-9]+)?$' then (${e})::numeric end)`;
const asDate = (e: SQL) => sql`(case when ${e} ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])' then substr(${e}, 1, 10)::date end)`;
const today = sql`((now() at time zone 'Asia/Kolkata')::date)`;

/** A column as SQL, of the type its kind compares as: text, number or date. */
function exprOf(col: ViewColumn): SQL {
  switch (col.key) {
    case '@owner': return sql`${users.name}`;
    case '@department': return sql`(${records.departmentId})::text`;
    case '@status': return sql`(${records.status})::text`;
    case '@year': return sql`(${records.periodYear})::numeric`;
    case '@cy': return sql`(${records.cyYear})::numeric`;
    case '@fy': return sql`(${records.fyYear})::numeric`;
    case '@ay': return sql`(${records.ayYear})::numeric`;
    case '@updated': return sql`((${records.updatedAt} at time zone 'Asia/Kolkata')::date)`;
    default: {
      const t = text(col.key);
      if (col.kind === 'number' || col.kind === 'year') return asNumber(t);
      if (col.kind === 'date') return asDate(t);
      return t;
    }
  }
}

/** Compared as a number or a date, so "empty" means no value rather than an empty string. */
const typed = (col: ViewColumn) => ['number', 'year', 'date', 'jif'].includes(col.kind);

/** A LIKE pattern for the user's text, with its own % and _ made plain. */
const likeOf = (v: string, mode: 'contains' | 'starts') => {
  const plain = v.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
  return mode === 'contains' ? `%${plain}%` : `${plain}%`;
};

const list = (v: string[]) => sql.join(v.map((x) => sql`${x}`), sql`, `);

function leaf(col: ViewColumn, c: Condition): SQL {
  const e = exprOf(col);
  const v = c.value ?? [];
  const num = col.kind === 'number' || col.kind === 'year';
  const cast = (x: string) => (num ? sql`${x}::numeric` : sql`${x}::date`);
  switch (c.op) {
    case 'contains': return sql`lower(${e}) like ${likeOf(v[0]!, 'contains')} escape '\\'`;
    case 'notContains': return sql`(${e} is null or lower(${e}) not like ${likeOf(v[0]!, 'contains')} escape '\\')`;
    case 'startsWith': return sql`lower(${e}) like ${likeOf(v[0]!, 'starts')} escape '\\'`;
    case 'is': return col.kind === 'text' ? sql`lower(${e}) = lower(${v[0]!})` : sql`${e} = ${v[0]!}`;
    case 'isNot': return col.kind === 'text' ? sql`(${e} is null or lower(${e}) <> lower(${v[0]!}))` : sql`(${e} is null or ${e} <> ${v[0]!})`;
    case 'isEmpty': return typed(col) ? sql`${e} is null` : sql`(${e} is null or ${e} = '')`;
    case 'isNotEmpty': return typed(col) ? sql`${e} is not null` : sql`(${e} is not null and ${e} <> '')`;
    case 'isAnyOf': return sql`${e} in (${list(v)})`;
    case 'isNoneOf': return sql`(${e} is null or ${e} not in (${list(v)}))`;
    case 'eq': return sql`${e} = ${cast(v[0]!)}`;
    case 'neq': return sql`(${e} is null or ${e} <> ${cast(v[0]!)})`;
    case 'lt': return sql`${e} < ${cast(v[0]!)}`;
    case 'lte': return sql`${e} <= ${cast(v[0]!)}`;
    case 'gt': return sql`${e} > ${cast(v[0]!)}`;
    case 'gte': return sql`${e} >= ${cast(v[0]!)}`;
    case 'between': return sql`(${e} >= least(${cast(v[0]!)}, ${cast(c.value2!)}) and ${e} <= greatest(${cast(v[0]!)}, ${cast(c.value2!)}))`;
    case 'lastDays': return sql`(${e} >= ${today} - ${Number(v[0])}::int and ${e} <= ${today})`;
    case 'isTrue': return sql`${e} = 'true'`;
    case 'isFalse': return sql`(${e} is null or ${e} <> 'true')`;
    case 'hasFile': return sql`(${e} is not null and ${e} <> '')`;
    case 'noFile': return sql`(${e} is null or ${e} = '')`;
    default: return sql`false`;      // the worked-out operators are answered by derivedSql
  }
}

/* ─────────────────────── worked-out columns ─────────────────────── */

/**
 * Indexing, quartiles, Impact Factor and validity are worked out from the ISSN and the dates, not stored,
 * so they cannot be compared in the database. Each such condition is answered by finding the matching
 * records among the caller's own (scopeFilter) and turning them into "the record is one of these".
 */
async function derivedSql(
  actor: SessionUser, m: ModuleConfig, conds: Array<{ c: Condition; col: ViewColumn }>,
): Promise<Map<Condition, SQL>> {
  const out = new Map<Condition, SQL>();
  if (conds.length === 0) return out;
  const rows = await db.select({ id: records.id, data: records.data }).from(records)
    .where(scopeFilter(actor, m)).limit(30_000);
  const data = (r: { data: unknown }) => (r.data ?? {}) as Record<string, unknown>;
  const needRank = conds.some(({ col }) => ['indexing', 'quartile', 'jif'].includes(col.kind));
  const ranks = needRank ? await rankingsFor(rows.map((r) => rankingItemOf(r.id, data(r)))) : null;
  const span = SPAN_MODULES[m.key];

  for (const { c, col } of conds) {
    const v = c.value ?? [];
    const ids = rows.filter((r) => {
      if (col.kind === 'valid') {
        if (!span) return false;
        const d = data(r);
        const forLife = !!span.lifetime && d[span.lifetime] === true;
        const end = validUntil(d[span.from], d[span.years], forLife);
        const date = typeof d[span.from] === 'string' ? new Date(String(d[span.from])) : null;
        const hasStart = !!date && !Number.isNaN(date.getTime());
        const now = Date.now() - 86_400_000;
        const ended = end !== null && end !== 'lifetime' && end.getTime() < now;
        switch (c.op) {
          case 'validToday': return hasStart && end !== null && !ended;
          case 'expired': return ended;
          case 'lifetime': return forLife && hasStart;
          case 'lt': return end !== null && end !== 'lifetime' && end.getTime() < Date.parse(`${v[0]}T00:00:00Z`);
          case 'gt': return end === 'lifetime' || (end !== null && end.getTime() > Date.parse(`${v[0]}T00:00:00Z`));
          default: return false;
        }
      }
      const rk = ranks!.get(r.id);
      if (!rk) return false;
      if (col.kind === 'indexing') {
        const has = v.some((x) => rk.indexes.includes(x));
        return c.op === 'hasAnyOf' ? has : !has;
      }
      if (col.kind === 'quartile') {
        const q = (col.key === 'jifQuartile' ? rk.jifQuartile : rk.sjrQuartile) ?? 'NA';
        return c.op === 'isAnyOf' ? v.includes(q) : !v.includes(q);
      }
      const jif = rk.jif === null ? null : Number.parseFloat(rk.jif);
      const n = jif === null || Number.isNaN(jif) ? null : jif;
      if (c.op === 'isEmpty') return n === null;
      if (n === null) return false;
      const a = Number(v[0]);
      if (c.op === 'gte') return n >= a;
      if (c.op === 'lte') return n <= a;
      const b = Number(c.value2);
      return n >= Math.min(a, b) && n <= Math.max(a, b);
    }).map((r) => r.id);
    out.set(c, ids.length ? inArray(records.id, ids) : sql`false`);
  }
  return out;
}

/* ───────────────────────────── the whole view ───────────────────────────── */

export interface ViewQuery {
  view: ViewState;
  columns: ViewColumn[];
  /** The view's conditions; undefined when there are none. Always combined with scopeFilter by the caller. */
  where: SQL | undefined;
  orderBy: SQL[];
  /** The group a record is under, as text; null when not grouped. */
  groupExpr: SQL | null;
}

const groupExprOf = (col: ViewColumn): SQL => {
  switch (col.key) {
    case '@owner': return sql`coalesce(${users.name}, '(none)')`;
    case '@department': return sql`coalesce(${departments.name}, '(none)')`;
    case '@status': return sql`(${records.status})::text`;
    default: break;
  }
  const e = exprOf(col);
  if (col.kind === 'bool') return sql`(case when ${e} = 'true' then 'Yes' else 'No' end)`;
  return sql`coalesce(nullif((${e})::text, ''), '(none)')`;
};

/** Reads a raw view (from an address, a saved view or a request) and builds its SQL for this module. */
export async function buildViewQuery(actor: SessionUser, m: ModuleConfig, raw: unknown): Promise<ViewQuery> {
  const columns = await viewColumnsFor(m);
  const view = cleanView(raw, columns);
  const byKey = new Map(columns.map((c) => [c.key, c]));

  // First the worked-out conditions, answered by looking at the records themselves.
  const pending: Array<{ c: Condition; col: ViewColumn }> = [];
  const visit = (c: Condition) => { const col = byKey.get(c.field)!; if (col.derived) pending.push({ c, col }); };
  for (const it of view.filter.items) { if (isGroup(it)) it.items.forEach(visit); else visit(it); }
  const answers = await derivedSql(actor, m, pending);

  const one = (c: Condition): SQL => answers.get(c) ?? leaf(byKey.get(c.field)!, c);
  const parts = view.filter.items.map((it): SQL | undefined => (isGroup(it)
    ? (it.join === 'or' ? or(...it.items.map(one)) : and(...it.items.map(one)))
    : one(it)));
  const where = view.filter.items.length === 0 ? undefined
    : view.filter.join === 'or' ? or(...parts) : and(...parts);

  const orderBy = view.sort.map((s) => {
    const col = byKey.get(s.field)!;
    const e = col.kind === 'text' ? sql`lower(${exprOf(col)})` : exprOf(col);
    return s.dir === 'desc' ? sql`${e} desc nulls last` : sql`${e} asc nulls last`;
  });
  const groupCol = view.groupBy ? byKey.get(view.groupBy) : undefined;
  return { view, columns, where, orderBy, groupExpr: groupCol ? groupExprOf(groupCol) : null };
}

