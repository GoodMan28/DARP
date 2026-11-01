'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Button, Card, CardHeader, Notice, Select, Table, Th, Td } from '@/components/ui';
import { formatRupees } from '@darp/shared/format';
import type { ComputedCounter, CounterValues } from '@darp/shared/contracts';

/**
 * One figure: its count in the chosen years and since joining, side by side; or, for a figure that
 * does not depend on the years (awards still valid today), one count across both columns.
 */
interface Row { name: string; moduleKey: string; inRange?: ComputedCounter; since?: ComputedCounter; today?: ComputedCounter }

function rowsByModule(computed: ComputedCounter[]): Array<[string, Row[]]> {
  const rows = new Map<string, Row>();
  for (const c of computed) {
    const base = c.key.replace(/\.(cycle|sinceJoining)$/, '');
    const row = rows.get(base) ?? { name: '', moduleKey: c.moduleKey };
    if (c.window === 'today') {
      row.today = c;
      row.name = c.label;
    } else if (c.window === 'sinceJoining') {
      row.since = c;
      row.name = c.label.replace(/ since joining BIT$/, '');
    } else {
      row.inRange = c;
      if (!row.name) row.name = c.label;
    }
    rows.set(base, row);
  }
  const groups = new Map<string, Row[]>();
  for (const [base, row] of rows) {
    const moduleName = (row.since ?? row.inRange ?? row.today)!.moduleName;
    const list = groups.get(moduleName) ?? [];
    list.push({ ...row, name: row.name || base });
    groups.set(moduleName, list);
  }
  return [...groups.entries()];
}

function show(c: ComputedCounter | undefined) {
  if (!c) return '—';
  return c.format === 'money' ? formatRupees(c.value) : c.value;
}

/**
 * The totals computed from the person's records, shown only when asked for. The years are chosen
 * here; "since joining" figures always count every year.
 */
export function MyNumbers() {
  const id = useId();
  const [data, setData] = useState<CounterValues | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(from?: number, to?: number) {
    setBusy(true);
    setError(null);
    const qs = from && to ? `?from=${Math.min(from, to)}&to=${Math.max(from, to)}` : '';
    const res = await apiJson<CounterValues>(`/api/profile/rollups${qs}`);
    setBusy(false);
    if (!res.ok) { setError(res.error.message); return; }
    setData(res.data);
    setOpen(true);
  }

  const years: number[] = [];
  if (data) for (let y = data.maxYear; y >= data.minYear; y--) years.push(y);
  const { from, to } = data?.range ?? { from: 0, to: 0 };

  return (
    <Card padded={false}>
      <CardHeader
        title="My numbers"
        subtitle="Totals counted from your records. Shown only when you ask for them."
        actions={open
          ? <Button variant="secondary" onClick={() => setOpen(false)}>Hide</Button>
          : <Button variant="secondary" disabled={busy} onClick={() => void load()}>{busy ? 'Loading…' : 'Show my numbers'}</Button>}
      />
      {error ? <Notice tone="danger" className="m-4">{error}</Notice> : null}
      {open && data ? (
        <div>
          <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
            <div>
              <label htmlFor={`${id}-from`} className="mb-1 block text-xs font-semibold text-ink-muted">From</label>
              <Select id={`${id}-from`} value={from} disabled={busy} onChange={(e) => void load(Number(e.target.value), to)}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </div>
            <div>
              <label htmlFor={`${id}-to`} className="mb-1 block text-xs font-semibold text-ink-muted">To</label>
              <Select id={`${id}-to`} value={to} disabled={busy} onChange={(e) => void load(from, Number(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </div>
            <p className="max-w-2xl pb-1 text-xs text-ink-muted">
              {from} to {to} means calendar years 1 Jan {from} – 31 Dec {to}; financial years
              FY {from}-{String(from + 1).slice(-2)} to {to}-{String(to + 1).slice(-2)} (1 Apr {from} – 31 Mar {to + 1});
              academic years AY {from}-{String(from + 1).slice(-2)} to {to}-{String(to + 1).slice(-2)} (1 Jul {from} – 30 Jun {to + 1}).
              Each figure uses its module’s year type.
            </p>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Figure</Th>
                <Th className="w-36 text-right">In {from}–{to}</Th>
                <Th className="w-36 text-right">Since joining</Th>
              </tr>
            </thead>
            <tbody>
              {rowsByModule(data.computed).map(([moduleName, rows]) => (
                <ModuleRows key={moduleName} moduleName={moduleName} rows={rows} />
              ))}
            </tbody>
          </Table>
          <p className="px-4 py-2.5 text-2xs text-ink-muted">
            Drafts never count, and neither does work marked as not done while you were at BIT: it stays in your modules.
            If a number is wrong, correct the record it comes from and the total follows.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function ModuleRows({ moduleName, rows }: { moduleName: string; rows: Row[] }) {
  return (
    <>
      <tr>
        <td colSpan={3} className="border-b border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-muted">
          {moduleName}{' '}
          <Link href={`/m/${rows[0]!.moduleKey}`} className="font-normal text-primary hover:underline">open →</Link>
        </td>
      </tr>
      {rows.map((r) => r.today ? (
        <tr key={r.name}>
          <Td>{r.name}</Td>
          <Td colSpan={2} className="text-right font-mono tabular-nums">
            {show(r.today)}
            <span className="block font-sans text-2xs text-ink-faint">on {new Date().toLocaleDateString('en-GB')}, whatever the year</span>
          </Td>
        </tr>
      ) : (
        <tr key={r.name}>
          <Td>{r.name}</Td>
          <Td className="text-right font-mono tabular-nums">{show(r.inRange)}</Td>
          <Td className="text-right font-mono tabular-nums">
            {show(r.since)}
            {r.since && r.since.baseline > 0 ? <span className="block text-2xs text-ink-faint">incl. {r.since.baseline} declared</span> : null}
          </Td>
        </tr>
      ))}
    </>
  );
}
