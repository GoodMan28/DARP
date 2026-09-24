'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { cx } from '@/lib/cx';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  Button, Card, CardHeader, Eyebrow, Field, Input, Notice, Table, Td, Th,
} from '@/components/ui';
import type { CycleRow, CyclesPayload } from './types';

/** A `datetime-local` value from a Date, in the browser's own zone. */
function toLocalInput(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const WINDOWS: ReadonlyArray<{
  code: 'CY' | 'FY' | 'AY';
  label: string;
  note: string;
  start: 'cyStart' | 'fyStart' | 'ayStart';
  end: 'cyEnd' | 'fyEnd' | 'ayEnd';
}> = [
  { code: 'CY', label: 'Calendar year', note: 'Publications, patents, awards', start: 'cyStart', end: 'cyEnd' },
  { code: 'FY', label: 'Financial year', note: 'Grants, consultancy, seed money', start: 'fyStart', end: 'fyEnd' },
  { code: 'AY', label: 'Academic year', note: 'Profile, teaching, students', start: 'ayStart', end: 'ayEnd' },
];

export function CyclePanel() {
  const [cycles, setCycles] = useState<CycleRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const [deadline, setDeadline] = useState('');
  const [entryOpens, setEntryOpens] = useState('');

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await apiJson<CyclesPayload>('/api/admin/cycles');
    if (!res.ok) { setLoadError(res.error.message); return; }
    setCycles(res.data.cycles);
    const active = res.data.cycles.find((c) => c.isActive);
    setDeadline(toLocalInput(active?.deadlineAt ?? null));
    setEntryOpens(toLocalInput(active?.entryOpensAt ?? null));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = cycles?.find((c) => c.isActive) ?? null;

  async function saveDates() {
    if (!active) return;
    setBusy(true);
    setSaveError(null);
    setFieldErrors({});
    setSaved(false);

    const res = await apiJson<{ cycle: CycleRow }>('/api/admin/cycles', {
      method: 'PATCH',
      body: JSON.stringify({
        id: active.id,
        entryOpensAt: fromLocalInput(entryOpens),
        deadlineAt: fromLocalInput(deadline),
      }),
    });

    setBusy(false);
    if (!res.ok) {
      setFieldErrors(res.error.fields ?? {});
      setSaveError(res.error.fields ? null : res.error.message);
      return;
    }
    setSaved(true);
    await load();
  }

  return (
    <div className="space-y-3">
      {loadError ? <Notice tone="danger" title="The cycle could not be loaded">{loadError}</Notice> : null}

      {cycles && !active ? (
        <Notice tone="warning" title="No active cycle">
          Records cannot be filed until one cycle is marked active. The database allows exactly one.
        </Notice>
      ) : null}

      {active ? (
        <>
          <Card padded={false}>
            <CardHeader
              title={active.name}
              subtitle="The three reporting windows. Each module declares which one it reports against, so CY, FY and AY figures never mix."
              actions={
                <span className="inline-flex items-center rounded-xs border border-success-100 bg-success-50 px-1.5 py-0.5 text-2xs font-semibold text-success-700">
                  Active cycle
                </span>
              }
            />
            <div className="grid gap-3 p-4 md:grid-cols-3">
              {WINDOWS.map((w) => (
                <div key={w.code} className="rounded-sm border border-line bg-surface-2 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Eyebrow>{w.label}</Eyebrow>
                    <span className="font-mono text-2xs font-bold text-maroon-700">{w.code}</span>
                  </div>
                  <div className="mt-1.5 font-mono text-sm tabular-nums text-ink">
                    {formatDate(active[w.start])} → {formatDate(active[w.end])}
                  </div>
                  <div className="mt-0.5 text-2xs text-ink-muted">{w.note}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card padded={false}>
            <CardHeader
              title="Entry window"
              subtitle="When faculty may file, and the date the portal shows as the deadline."
            />
            <div className="grid gap-3 p-4 md:grid-cols-2">
              <Field label="Entry opens" error={fieldErrors.entryOpensAt} help="Leave empty to keep entry open now." htmlFor="cy-opens">
                <Input
                  id="cy-opens"
                  type="datetime-local"
                  value={entryOpens}
                  onChange={(e) => setEntryOpens(e.target.value)}
                />
              </Field>
              <Field label="Deadline" error={fieldErrors.deadlineAt} help="Shown on every dashboard and in the footer countdown." htmlFor="cy-deadline">
                <Input
                  id="cy-deadline"
                  type="datetime-local"
                  value={deadline}
                  aria-invalid={fieldErrors.deadlineAt ? true : undefined}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </Field>
            </div>
            {saveError ? <div className="px-4 pb-3"><Notice tone="danger">{saveError}</Notice></div> : null}
            {saved ? <div className="px-4 pb-3"><Notice tone="success">The cycle dates were saved and logged.</Notice></div> : null}
            <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
              <p className="text-xs text-ink-muted">
                Currently: {active.deadlineAt ? formatDateTime(active.deadlineAt) : 'no deadline set'}.
              </p>
              <Button disabled={busy} onClick={() => void saveDates()}>
                {busy ? 'Saving…' : 'Save dates'}
              </Button>
            </div>
          </Card>
        </>
      ) : null}

      {cycles && cycles.length > 1 ? (
        <Card padded={false}>
          <CardHeader title="All cycles" subtitle="Past and future cycles are kept; only one may be active." />
          <Table>
            <thead>
              <tr>
                <Th>Cycle</Th>
                <Th>CY</Th>
                <Th>FY</Th>
                <Th>AY</Th>
                <Th>Deadline</Th>
                <Th>State</Th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.id} className={cx(!c.isActive && 'bg-surface-inset')}>
                  <Td className="font-semibold">{c.name}</Td>
                  <Td className="font-mono text-2xs tabular-nums text-ink-muted">{formatDate(c.cyStart)} → {formatDate(c.cyEnd)}</Td>
                  <Td className="font-mono text-2xs tabular-nums text-ink-muted">{formatDate(c.fyStart)} → {formatDate(c.fyEnd)}</Td>
                  <Td className="font-mono text-2xs tabular-nums text-ink-muted">{formatDate(c.ayStart)} → {formatDate(c.ayEnd)}</Td>
                  <Td className="tabular-nums text-ink-muted">{c.deadlineAt ? formatDateTime(c.deadlineAt) : '—'}</Td>
                  <Td>{c.isActive ? 'Active' : 'Closed'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {cycles === null ? <p className="px-4 py-10 text-center text-sm text-ink-muted">Loading the cycle…</p> : null}
    </div>
  );
}
