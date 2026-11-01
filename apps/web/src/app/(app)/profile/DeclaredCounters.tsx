'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Input, Select, Button, Notice, CardHeader } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { DeclaredRow, DeclaredSheet } from '@darp/shared/contracts';

const GROUPS: Array<{ key: DeclaredRow['section']; title: string }> = [
  { key: 'since', title: 'Since joining BIT' },
  { key: 'ay', title: 'Academic year' },
  { key: 'cy', title: 'Calendar year' },
];

const textOf = (v: number | null) => (v === null ? '' : String(v));
const fromRows = (rows: DeclaredRow[]) => Object.fromEntries(rows.map((r) => [r.key, textOf(r.value)]));
const yearName = (type: 'ay' | 'cy', y: number) => (type === 'ay' ? `AY ${y}-${String(y + 1).slice(-2)}` : `${y}`);

/**
 * The figures DARP holds no records for, entered once for the year they are about. The person picks the
 * academic and the calendar year (any that has ended), types what applies, and saves everything at once.
 * An empty box is "not answered", and 0 is an answer. "Show counted figures" puts what DARP counts from
 * the person's records beside each, where it can.
 */
export function DeclaredCounters({ initial }: { initial: DeclaredSheet }) {
  const id = useId();
  const [sheet, setSheet] = useState(initial);
  const [values, setValues] = useState<Record<string, string>>(fromRows(initial.rows));
  const [counted, setCounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [switching, setSwitching] = useState<{ ay: number; cy: number } | null>(null);

  const base = fromRows(sheet.rows);
  const changed = sheet.rows.filter((r) => (values[r.key] ?? '') !== base[r.key]);

  async function load(ay: number, cy: number, withCounted: boolean) {
    setBusy(true);
    setError(null);
    const res = await apiJson<DeclaredSheet>(`/api/profile/declared?ay=${ay}&cy=${cy}${withCounted ? '&counted=1' : ''}`);
    setBusy(false);
    if (!res.ok) { setError(res.error.message); return false; }
    setSheet(res.data);
    setValues(fromRows(res.data.rows));
    return true;
  }

  function chooseYear(next: { ay: number; cy: number }) {
    if (changed.length > 0) { setSwitching(next); return; }
    void load(next.ay, next.cy, counted);
  }

  async function toggleCounted() {
    if (counted) { setCounted(false); return; }
    // Counting reads the records again; the typed figures stay as they are.
    setBusy(true);
    setError(null);
    const res = await apiJson<DeclaredSheet>(`/api/profile/declared?ay=${sheet.ay}&cy=${sheet.cy}&counted=1`);
    setBusy(false);
    if (!res.ok) { setError(res.error.message); return; }
    setSheet((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, counted: res.data.rows.find((x) => x.key === r.key)?.counted })) }));
    setCounted(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await apiJson('/api/profile/declared', {
      method: 'PUT',
      body: JSON.stringify({ values: changed.map((r) => ({ counterKey: r.key, value: (values[r.key] ?? '') === '' ? null : Number(values[r.key]) })) }),
    });
    setBusy(false);
    if (!res.ok) { setError(res.error.message); return; }
    if (await load(sheet.ay, sheet.cy, counted)) setSaved(true);
  }

  const set = (key: string, v: string) => { setSaved(false); setValues((all) => ({ ...all, [key]: v })); };

  return (
    <div>
      <CardHeader
        title="Figures you declare"
        subtitle="Numbers DARP has no records for. Saved for the year you choose."
        actions={(
          <Button variant="secondary" disabled={busy} onClick={() => void toggleCounted()}>
            {counted ? 'Hide counted figures' : 'Show counted figures'}
          </Button>
        )}
      />
      {error ? <div className="p-4 pb-0"><Notice tone="danger">{error}</Notice></div> : null}

      {GROUPS.map((g) => {
        const rows = sheet.rows.filter((r) => r.section === g.key);
        return (
          <section key={g.key} aria-labelledby={`${id}-${g.key}`}>
            <div className="flex flex-wrap items-center gap-3 border-b border-t border-line bg-surface-2 px-4 py-2">
              <h3 id={`${id}-${g.key}`} className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{g.title}</h3>
              {g.key !== 'since' ? (
                <div className="w-40">
                <Select
                  aria-label={`${g.title}`}
                  disabled={busy}
                  value={g.key === 'ay' ? sheet.ay : sheet.cy}
                  onChange={(e) => chooseYear({ ay: g.key === 'ay' ? Number(e.target.value) : sheet.ay, cy: g.key === 'cy' ? Number(e.target.value) : sheet.cy })}
                >
                  {sheet.years[g.key].map((y) => <option key={y} value={y}>{yearName(g.key as 'ay' | 'cy', y)}</option>)}
                </Select>
                </div>
              ) : null}
              {counted ? <span className="ml-auto text-2xs font-semibold text-ink-muted">Counted by DARP</span> : null}
            </div>
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.key} className="grid items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[1fr_9rem_14rem]">
                  <div className="min-w-0">
                    <label htmlFor={`${id}-${r.key}`} className="block text-sm text-ink">{r.label}</label>
                    {r.help ? <p className="text-2xs text-ink-muted">{r.help}</p> : null}
                  </div>
                  {r.format === 'yesno' ? (
                    <div className="w-36"><Select id={`${id}-${r.key}`} disabled={busy} value={values[r.key] ?? ''} onChange={(e) => set(r.key, e.target.value)}>
                      <option value="">Not answered</option>
                      <option value="0">No</option>
                      <option value="1">Yes</option>
                    </Select></div>
                  ) : (
                    <Input
                      id={`${id}-${r.key}`}
                      className="w-28 text-right font-mono tabular-nums"
                      inputMode="numeric"
                      placeholder="—"
                      disabled={busy}
                      value={values[r.key] ?? ''}
                      onChange={(e) => set(r.key, e.target.value.replace(/[^\d]/g, ''))}
                    />
                  )}
                  {counted && r.counted ? (
                    <div className="text-xs text-ink-muted">
                      {r.counted.value === null ? null : <span className="font-mono text-sm tabular-nums text-ink">{r.counted.value}</span>}
                      <span className="block text-2xs">{r.counted.note}{' '}
                        {r.counted.moduleKey ? <Link href={`/m/${r.counted.moduleKey}`} className="font-semibold text-primary hover:underline">open →</Link> : null}
                      </span>
                    </div>
                  ) : <span className="hidden sm:block" />}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
        <Button disabled={busy || changed.length === 0} onClick={() => void save()}>{busy ? 'Saving…' : 'Save changes'}</Button>
        {saved ? <span className="text-sm text-success-700" role="status">Saved</span> : null}
        {changed.length > 0 ? <span className="text-xs text-ink-muted">{changed.length} {changed.length === 1 ? 'change' : 'changes'} not saved</span> : null}
        <span className="ml-auto text-2xs text-ink-muted">Every change is kept in the audit log.</span>
      </div>

      <ConfirmDialog
        open={!!switching}
        title="Discard your changes?"
        confirmLabel="Discard and change the year"
        stayLabel="Keep editing"
        onConfirm={() => { const next = switching!; setSwitching(null); void load(next.ay, next.cy, counted); }}
        onCancel={() => setSwitching(null)}
      >
        You have {changed.length} {changed.length === 1 ? 'change' : 'changes'} that {changed.length === 1 ? 'is' : 'are'} not saved. Save them first, or they will be lost.
      </ConfirmDialog>
    </div>
  );
}
