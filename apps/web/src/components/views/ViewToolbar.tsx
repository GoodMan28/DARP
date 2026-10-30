'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiJson } from '@/lib/csrf-client';
import { Button, Checkbox, Input, Select } from '@/components/ui';
import { IconDownload, IconFilter, IconList, IconSortAsc, IconTrash, IconPlus, IconEdit } from '@/components/shell/Icon';
import { cx } from '@/lib/cx';
import {
  EMPTY_VIEW, OPS, cleanView, conditionCount, describeView, encodeView, isGroup, isPlain, opLabel, shapeOf,
  type Condition, type ConditionGroup, type FilterGroup, type SavedView, type ViewColumn, type ViewState,
} from '@darp/shared/views';

type Panel = 'cols' | 'filter' | 'sort' | 'group' | 'export' | 'views' | null;

interface Props {
  moduleKey: string;
  columns: ViewColumn[];
  /** The columns shown when the view chooses none. */
  usualCols: string[];
  view: ViewState;
  total: number;
  /** The page's own filters, kept when the view changes: search, status, year. */
  base: { q: string; status: string; year: string; check: boolean };
  isAdmin: boolean;
}

const KIND_NEEDS_OPTIONS = ['select', 'indexing', 'quartile'];

/* ───────────────────────────── one condition ───────────────────────────── */

function ValueInputs({ cond, col, onChange }: { cond: Condition; col: ViewColumn; onChange: (c: Condition) => void }) {
  const shape = shapeOf(cond.op);
  const v = cond.value ?? [];
  const isDateKind = col.kind === 'date' || (col.kind === 'valid' && (cond.op === 'lt' || cond.op === 'gt'));
  const numeric = col.kind === 'number' || col.kind === 'year' || col.kind === 'jif';
  const type = isDateKind ? 'date' : 'text';
  const one = (value: string, onValue: (s: string) => void, label: string) => (
    col.options && KIND_NEEDS_OPTIONS.includes(col.kind) ? (
      <Select aria-label={label} value={value} onChange={(e) => onValue(e.target.value)}>
        <option value="">Select a value</option>
        {col.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    ) : (
      <Input aria-label={label} type={type} inputMode={numeric ? 'decimal' : undefined} placeholder="Enter a value" value={value} onChange={(e) => onValue(e.target.value)} />
    )
  );
  if (shape === 'none') return <span className="text-xs text-ink-faint">No value needed</span>;
  if (shape === 'one') return one(v[0] ?? '', (s) => onChange({ ...cond, value: s ? [s] : [] }), 'Value');
  if (shape === 'days') {
    return (
      <span className="flex items-center gap-2">
        <Input aria-label="Number of days" inputMode="numeric" className="w-24" value={v[0] ?? ''} onChange={(e) => onChange({ ...cond, value: [e.target.value.replace(/\D/g, '')] })} />
        <span className="text-sm text-ink-muted">days</span>
      </span>
    );
  }
  if (shape === 'two') {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {one(v[0] ?? '', (s) => onChange({ ...cond, value: s ? [s] : [] }), 'From')}
        <span className="text-sm text-ink-muted">and</span>
        {one(cond.value2 ?? '', (s) => onChange({ ...cond, value2: s }), 'To')}
      </span>
    );
  }
  // A list: tick the choices, or type them separated by commas.
  if (col.options) {
    return (
      <div className="max-h-40 min-w-56 overflow-auto rounded-sm border border-line px-2 py-1">
        {col.options.map((o) => (
          <label key={o.value} className="flex items-center gap-1.5 py-0.5 text-sm">
            <Checkbox
              checked={v.includes(o.value)}
              onChange={(e) => onChange({ ...cond, value: e.target.checked ? [...v, o.value] : v.filter((x) => x !== o.value) })}
            />
            {o.label}
          </label>
        ))}
      </div>
    );
  }
  return <Input aria-label="Values, separated by commas" placeholder="One or more, separated by commas" value={v.join(', ')} onChange={(e) => onChange({ ...cond, value: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />;
}

function ConditionRow({ cond, columns, lead, onChange, onDelete }: {
  cond: Condition; columns: ViewColumn[]; lead: React.ReactNode; onChange: (c: Condition) => void; onDelete: () => void;
}) {
  const col = columns.find((c) => c.key === cond.field) ?? columns[0]!;
  const fields = columns.filter((c) => !c.meta && !c.derived);
  const worked = columns.filter((c) => c.derived);
  const facts = columns.filter((c) => c.meta);
  return (
    <div className="flex flex-wrap items-start gap-2">
      <span className="w-24 shrink-0 pt-2 text-sm text-ink-muted">{lead}</span>
      <div className="w-56 shrink-0">
        <Select
          aria-label="Field"
          value={col.key}
          onChange={(e) => {
            const next = columns.find((c) => c.key === e.target.value)!;
            onChange({ field: next.key, op: OPS[next.kind][0]! });
          }}
        >
          <optgroup label="Fields">{fields.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</optgroup>
          {worked.length ? <optgroup label="Worked out from the journal or dates">{worked.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</optgroup> : null}
          <optgroup label="The record">{facts.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</optgroup>
        </Select>
      </div>
      <div className="w-44 shrink-0">
        <Select aria-label="Condition" value={cond.op} onChange={(e) => onChange({ field: cond.field, op: e.target.value as Condition['op'] })}>
          {OPS[col.kind].map((op) => <option key={op} value={op}>{opLabel(op, col.kind)}</option>)}
        </Select>
      </div>
      <div className="min-w-48 flex-1"><ValueInputs cond={{ ...cond, field: col.key }} col={col} onChange={onChange} /></div>
      <button type="button" aria-label="Remove this condition" onClick={onDelete} className="rounded-sm p-2 text-ink-muted hover:bg-surface-2 hover:text-danger-700">
        <IconTrash width={15} height={15} />
      </button>
    </div>
  );
}

/* ───────────────────────────── the filter builder ───────────────────────────── */

function JoinWord({ join, onChange, editable }: { join: 'and' | 'or'; onChange: (j: 'and' | 'or') => void; editable: boolean }) {
  return editable
    ? <Select aria-label="Join with" className="w-24" value={join} onChange={(e) => onChange(e.target.value as 'and' | 'or')}><option value="and">and</option><option value="or">or</option></Select>
    : <>{join}</>;
}

function FilterBuilder({ columns, draft, setDraft }: { columns: ViewColumn[]; draft: FilterGroup; setDraft: (f: FilterGroup) => void }) {
  const first = columns.find((c) => !c.meta && !c.derived) ?? columns[0]!;
  const blank = (): Condition => ({ field: first.key, op: OPS[first.kind][0]! });
  const setItem = (i: number, it: Condition | ConditionGroup) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? it : x)) });
  const drop = (i: number) => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) });
  return (
    <div className="space-y-2">
      {draft.items.length === 0 ? <p className="text-sm text-ink-muted">No conditions: every record is shown.</p> : null}
      {draft.items.map((it, i) => {
        const lead = i === 0 ? 'Where' : <JoinWord join={draft.join} editable={i === 1} onChange={(join) => setDraft({ ...draft, join })} />;
        if (!isGroup(it)) {
          return <ConditionRow key={i} cond={it} columns={columns} lead={lead} onChange={(c) => setItem(i, c)} onDelete={() => drop(i)} />;
        }
        return (
          <div key={i} className="flex items-start gap-2">
            <span className="w-24 shrink-0 pt-3 text-sm text-ink-muted">{lead}</span>
            <div className="min-w-0 flex-1 rounded-sm border border-line bg-surface-2 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm text-ink-muted">
                <span>Any / all of the following are true…</span>
                <span className="w-24"><JoinWord join={it.join} editable onChange={(join) => setItem(i, { ...it, join })} /></span>
                <button type="button" aria-label="Add a condition to this group" className="ml-auto rounded-sm p-1.5 hover:bg-surface" onClick={() => setItem(i, { ...it, items: [...it.items, blank()] })}><IconPlus width={14} height={14} /></button>
                <button type="button" aria-label="Remove this group" className="rounded-sm p-1.5 hover:bg-surface hover:text-danger-700" onClick={() => drop(i)}><IconTrash width={14} height={14} /></button>
              </div>
              <div className="space-y-2">
                {it.items.map((c, j) => (
                  <ConditionRow
                    key={j} cond={c} columns={columns}
                    lead={j === 0 ? 'Where' : <span>{it.join}</span>}
                    onChange={(next) => setItem(i, { ...it, items: it.items.map((x, k) => (k === j ? next : x)) })}
                    onDelete={() => setItem(i, { ...it, items: it.items.filter((_, k) => k !== j) })}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-4 pt-1 text-sm font-semibold text-primary">
        <button type="button" className="inline-flex items-center gap-1 hover:underline" onClick={() => setDraft({ ...draft, items: [...draft.items, blank()] })}><IconPlus width={13} height={13} />Add condition</button>
        <button type="button" className="inline-flex items-center gap-1 hover:underline" onClick={() => setDraft({ ...draft, items: [...draft.items, { join: 'and', items: [blank()] }] })}><IconPlus width={13} height={13} />Add condition group</button>
      </div>
    </div>
  );
}

/* ───────────────────────────── the toolbar ───────────────────────────── */

export function ViewToolbar({ moduleKey, columns, usualCols, view, total, base, isAdmin }: Props) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState<Panel>(null);
  const [draftFilter, setDraftFilter] = useState<FilterGroup>(view.filter);
  const [draftSort, setDraftSort] = useState(view.sort);
  const [draftGroup, setDraftGroup] = useState(view.groupBy ?? '');
  const [draftCols, setDraftCols] = useState<string[]>(view.cols ?? usualCols);
  const [saved, setSaved] = useState<SavedView[] | null>(null);
  const [viewsError, setViewsError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [shareIt, setShareIt] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // The drafts follow the view in the address (Back, a link, a saved view).
  useEffect(() => {
    setDraftFilter(view.filter); setDraftSort(view.sort); setDraftGroup(view.groupBy ?? ''); setDraftCols(view.cols ?? usualCols);
  }, [view, usualCols]);

  // Escape, or a click elsewhere, closes the open panel.
  useEffect(() => {
    if (!open) return undefined;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    const click = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', click);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', click); };
  }, [open]);

  const query = (v: ViewState, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(extra);
    if (base.q) p.set('q', base.q);
    if (base.status) p.set('status', base.status);
    if (base.year) p.set('year', base.year);
    if (base.check) p.set('check', '1');
    const enc = encodeView(v);
    if (enc) p.set('view', enc);
    return p.toString();
  };
  const go = (v: ViewState) => {
    setOpen(null);
    // Half-filled conditions are left out of the address.
    const qs = query(cleanView(v, columns));
    router.push(qs ? `/m/${moduleKey}?${qs}` : `/m/${moduleKey}`);
  };

  const sortable = columns.filter((c) => c.sortable);
  const groupable = columns.filter((c) => c.groupable);
  const showable = columns.filter((c) => !c.meta);
  const nFilter = conditionCount(view);
  const exportHref = (format: 'xlsx' | 'csv') => `/api/modules/${moduleKey}/records/export?${query(view, { format })}`;

  async function openViews() {
    setOpen(open === 'views' ? null : 'views');
    if (saved === null) {
      const r = await apiJson<SavedView[]>(`/api/modules/${moduleKey}/views`);
      if (r.ok) setSaved(r.data); else setViewsError(r.error.message);
    }
  }
  async function saveCurrent() {
    setViewsError(null);
    const r = await apiJson<SavedView>(`/api/modules/${moduleKey}/views`, { method: 'POST', body: JSON.stringify({ name, view, shared: shareIt }) });
    if (!r.ok) { setViewsError(r.error.fields?.name ?? r.error.message); return; }
    setSaved((s) => [...(s ?? []), r.data]);
    setName('');
  }
  async function remove(sv: SavedView) {
    const r = await apiJson(`/api/modules/${moduleKey}/views/${sv.id}`, { method: 'DELETE' });
    if (r.ok) setSaved((s) => (s ?? []).filter((x) => x.id !== sv.id)); else setViewsError(r.error.message);
  }

  const tool = (key: Exclude<Panel, null>, label: string, icon: React.ReactNode, badge?: string, on?: () => void) => (
    <button
      type="button"
      aria-expanded={open === key}
      aria-haspopup="dialog"
      onClick={on ?? (() => setOpen(open === key ? null : key))}
      className={cx(
        'inline-flex min-h-9 items-center gap-1.5 rounded-sm border px-2.5 py-1 text-sm font-semibold',
        badge || open === key ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-ink hover:bg-surface-2',
      )}
    >
      {icon}{label}{badge ? <span className="rounded-xs bg-primary px-1.5 text-2xs text-ink-invert">{badge}</span> : null}
    </button>
  );
  const panel = 'absolute left-0 top-full z-30 mt-1 max-h-[75vh] w-[min(52rem,calc(100vw-2rem))] overflow-auto rounded-sm border border-line-strong bg-surface p-4 shadow-lg';

  return (
    <div ref={root} className="relative border-b border-line px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="View tools">
        {tool('cols', 'Fields', <IconList width={14} height={14} />, view.cols ? String(view.cols.length) : undefined)}
        {tool('filter', 'Filter', <IconFilter width={14} height={14} />, nFilter ? String(nFilter) : undefined)}
        {tool('sort', 'Sort', <IconSortAsc width={14} height={14} />, view.sort.length ? String(view.sort.length) : undefined)}
        {tool('group', 'Group', <IconList width={14} height={14} />, view.groupBy ? '1' : undefined)}
        {tool('export', 'Export', <IconDownload width={14} height={14} />)}
        {tool('views', 'Views', <IconEdit width={14} height={14} />, undefined, () => void openViews())}
        {!isPlain(view) ? <button type="button" className="ml-auto text-sm font-semibold text-primary hover:underline" onClick={() => go(EMPTY_VIEW)}>Reset the view</button> : null}
      </div>

      {open === 'cols' ? (
        <div className={panel} role="dialog" aria-label="Choose the fields shown">
          <p className="mb-2 text-sm text-ink-muted">Tick the fields to show in the list and in an export.</p>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {showable.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm">
                <Checkbox checked={draftCols.includes(c.key)} onChange={(e) => setDraftCols((cols) => (e.target.checked ? [...cols, c.key] : cols.filter((k) => k !== c.key)))} />
                {c.label}{c.derived ? <span className="text-2xs text-ink-faint">worked out</span> : null}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button disabled={draftCols.length === 0} onClick={() => go({ ...view, cols: draftCols.length === usualCols.length && usualCols.every((k) => draftCols.includes(k)) ? null : showable.map((c) => c.key).filter((k) => draftCols.includes(k)) })}>Apply</Button>
            <Button variant="secondary" onClick={() => go({ ...view, cols: null })}>Show the usual fields</Button>
          </div>
        </div>
      ) : null}

      {open === 'filter' ? (
        <div className={panel} role="dialog" aria-label="Filter the records">
          <p className="mb-3 text-sm font-semibold">In this view, show records</p>
          <FilterBuilder columns={columns} draft={draftFilter} setDraft={setDraftFilter} />
          <div className="mt-4 flex gap-2 border-t border-line pt-3">
            <Button onClick={() => go({ ...view, filter: draftFilter })}>Apply the filter</Button>
            <Button variant="secondary" onClick={() => go({ ...view, filter: { join: 'and', items: [] } })}>Clear</Button>
          </div>
        </div>
      ) : null}

      {open === 'sort' ? (
        <div className={panel} role="dialog" aria-label="Sort the records">
          <div className="space-y-2">
            {draftSort.length === 0 ? <p className="text-sm text-ink-muted">Not sorted: the most recently updated first.</p> : null}
            {draftSort.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-24 text-sm text-ink-muted">{i === 0 ? 'Sort by' : 'then by'}</span>
                <div className="w-64">
                  <Select aria-label="Field" value={s.field} onChange={(e) => setDraftSort(draftSort.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}>
                    {sortable.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </Select>
                </div>
                <div className="w-48">
                  <Select aria-label="Direction" value={s.dir} onChange={(e) => setDraftSort(draftSort.map((x, j) => (j === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x)))}>
                    <option value="asc">A → Z, low → high</option>
                    <option value="desc">Z → A, high → low</option>
                  </Select>
                </div>
                <button type="button" aria-label="Remove this sort" className="rounded-sm p-2 text-ink-muted hover:bg-surface-2 hover:text-danger-700" onClick={() => setDraftSort(draftSort.filter((_, j) => j !== i))}><IconTrash width={15} height={15} /></button>
              </div>
            ))}
            {draftSort.length < 3 ? (
              <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                onClick={() => setDraftSort([...draftSort, { field: sortable.find((c) => !draftSort.some((s) => s.field === c.key))?.key ?? sortable[0]!.key, dir: 'asc' }])}>
                <IconPlus width={13} height={13} />Add a sort
              </button>
            ) : null}
          </div>
          <div className="mt-4 flex gap-2 border-t border-line pt-3">
            <Button onClick={() => go({ ...view, sort: draftSort })}>Apply the sort</Button>
            <Button variant="secondary" onClick={() => go({ ...view, sort: [] })}>Clear</Button>
          </div>
        </div>
      ) : null}

      {open === 'group' ? (
        <div className={panel} role="dialog" aria-label="Group the records">
          <label htmlFor={`${id}-group`} className="mb-1 block text-sm font-semibold">Group the records by</label>
          <div className="w-72">
            <Select id={`${id}-group`} value={draftGroup} onChange={(e) => setDraftGroup(e.target.value)}>
              <option value="">Nothing (one list)</option>
              {groupable.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
          </div>
          <p className="mt-1 text-xs text-ink-muted">Each group gets a heading with its number of records.</p>
          <div className="mt-4 flex gap-2 border-t border-line pt-3">
            <Button onClick={() => go({ ...view, groupBy: draftGroup || null })}>Apply</Button>
          </div>
        </div>
      ) : null}

      {open === 'export' ? (
        <div className={panel} role="dialog" aria-label="Export the records">
          <p className="text-sm">
            Exports exactly what this list shows: <strong>{total.toLocaleString('en-IN')} record{total === 1 ? '' : 's'}</strong>
            {total > 10_000 ? ' (the first 10,000; narrow the filter to get the rest)' : ''}, on every page, in this order, with the fields shown.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={exportHref('xlsx')} download className="inline-flex min-h-11 items-center gap-1.5 rounded-sm bg-primary px-3.5 py-2 text-sm font-semibold text-ink-invert no-underline"><IconDownload width={14} height={14} />Excel (.xlsx)</a>
            <a href={exportHref('csv')} download className="inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3.5 py-2 text-sm font-semibold text-ink no-underline hover:bg-surface-2"><IconDownload width={14} height={14} />CSV (.csv)</a>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Aadhaar and PAN are never exported. Statuses are as on this page; for the official approved-only formats use Reports.
          </p>
        </div>
      ) : null}

      {open === 'views' ? (
        <div className={panel} role="dialog" aria-label="Saved views">
          {saved === null && !viewsError ? <p className="text-sm text-ink-muted">Loading…</p> : null}
          {saved?.length === 0 ? <p className="text-sm text-ink-muted">No saved views yet.</p> : null}
          <ul className="divide-y divide-line">
            {(saved ?? []).map((sv) => (
              <li key={sv.id} className="flex items-center gap-3 py-2">
                <button type="button" className="text-left text-sm font-semibold text-primary hover:underline" onClick={() => go(sv.view)}>{sv.name}</button>
                <span className="text-2xs text-ink-faint">{sv.shared ? `shared by IQAC` : 'yours'}</span>
                {sv.mine ? <button type="button" aria-label={`Delete the view ${sv.name}`} className="ml-auto rounded-sm p-1.5 text-ink-muted hover:bg-surface-2 hover:text-danger-700" onClick={() => void remove(sv)}><IconTrash width={14} height={14} /></button> : null}
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-line pt-3">
            <label htmlFor={`${id}-name`} className="mb-1 block text-sm font-semibold">Save the view you have open</label>
            <div className="flex flex-wrap items-center gap-2">
              <Input id={`${id}-name`} className="w-72" placeholder="For example: Q1 and Q2 papers, 2022–24" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
              {isAdmin ? <label className="flex items-center gap-1.5 text-sm"><Checkbox checked={shareIt} onChange={(e) => setShareIt(e.target.checked)} />Share with everyone</label> : null}
              <Button variant="secondary" disabled={!name.trim() || isPlain(view)} onClick={() => void saveCurrent()}>Save</Button>
            </div>
            {isPlain(view) ? <p className="mt-1 text-xs text-ink-muted">Set a filter, sort, grouping or fields first.</p> : null}
            {viewsError ? <p role="alert" className="mt-1 text-xs text-danger-700">{viewsError}</p> : null}
          </div>
        </div>
      ) : null}

      {!isPlain(view) ? (
        <p className="mt-2 text-xs text-ink-muted" aria-live="polite">
          {describeView(view, columns) || 'Showing chosen fields.'}
        </p>
      ) : null}
    </div>
  );
}
