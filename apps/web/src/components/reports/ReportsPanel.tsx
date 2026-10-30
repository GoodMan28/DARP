'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import {
  Card, CardHeader, Checkbox, Input, LinkButton, Notice, Select, Table, Td, Th,
} from '@/components/ui';
import { IconDownload } from '@/components/shell/Icon';
import {
  YEAR_TYPE_LABEL, type ReportFormatKey, type ReportOptions, type ReportSummary, type ReportYearType,
} from '@darp/shared/reports';
import type { PeriodType } from '@darp/shared/modules/types';

const TYPE_WORD: Record<PeriodType, string> = { CY: 'Calendar years', FY: 'Financial years', AY: 'Academic years' };

/** "2022 to 2024" in a year type: "FY 2022-23 to FY 2024-25". */
function span(from: number, to: number, t: PeriodType) {
  const name = (y: number) => (t === 'CY' ? String(y) : `${t} ${y}-${String(y + 1).slice(-2)}`);
  return from === to ? name(from) : `${name(from)} to ${name(to)}`;
}

/**
 * Reports by year range: choose a format, the years and their type, and the departments; see how
 * many rows each sheet will hold; download the Excel file. Every choice is checked again by the
 * server, which never widens what this person may see.
 */
export function ReportsPanel() {
  const id = useId();
  const [opts, setOpts] = useState<ReportOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<ReportFormatKey>('naac');
  const [workbook, setWorkbook] = useState('');
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [yearType, setYearType] = useState<ReportYearType>('auto');
  const [depts, setDepts] = useState<Set<string>>(new Set());
  const [mods, setMods] = useState<Set<string>>(new Set());
  const [pii, setPii] = useState(false);
  const [reason, setReason] = useState('');
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void apiJson<ReportOptions>('/api/reports/options').then((r) => {
      if (!r.ok) { setError(r.error.message); return; }
      setOpts(r.data);
      setFrom(r.data.range.from);
      setTo(r.data.range.to);
      setWorkbook(r.data.workbooks[0]?.key ?? '');
      if (r.data.workbooks.length === 0) setFormat('full');
    });
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams({ from: String(Math.min(from, to)), to: String(Math.max(from, to)), yearType });
    if (format === 'naac') p.set('workbook', workbook);
    if (depts.size > 0) p.set('departments', [...depts].join(','));
    if (format === 'full' && mods.size > 0) p.set('modules', [...mods].join(','));
    if (pii) { p.set('includePii', '1'); p.set('reason', reason); }
    return p.toString();
  }, [format, workbook, from, to, yearType, depts, mods, pii, reason]);

  // The preview follows every choice, a moment after the last change.
  useEffect(() => {
    if (!opts || !from || (format === 'naac' && !workbook)) return undefined;
    const t = setTimeout(() => {
      setLoading(true);
      void apiJson<ReportSummary>(`/api/reports/${format}/summary?${query}`).then((r) => {
        setLoading(false);
        if (!r.ok) { setSummary(null); setSummaryError(r.error.message); return; }
        setSummaryError(null);
        setSummary(r.data);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [opts, format, workbook, from, query]);

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!opts) return <p className="text-sm text-ink-muted">Loading…</p>;

  const years: number[] = [];
  for (let y = opts.years.max; y >= opts.years.min; y -= 1) years.push(y);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const toggle = (set: Set<string>, key: string, on: boolean) => { const n = new Set(set); if (on) n.add(key); else n.delete(key); return n; };
  const piiBlocked = pii && reason.trim().length < 10;

  return (
    <div className="grid gap-4">
      <Card padded={false}>
        <CardHeader title="1. What to download" />
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {opts.formats.map((f) => {
            const usable = f.ready && (f.key !== 'naac' || opts.workbooks.length > 0);
            return (
              <label
                key={f.key}
                className={`flex gap-2 rounded-sm border p-3 ${format === f.key ? 'border-primary bg-primary-soft' : 'border-line'} ${usable ? 'cursor-pointer' : 'opacity-60'}`}
              >
                <input type="radio" name={`${id}-format`} disabled={!usable} checked={format === f.key} onChange={() => setFormat(f.key)} className="mt-1" />
                <span>
                  <span className="block text-sm font-semibold">{f.name}{f.ready ? '' : ' · format file needed'}</span>
                  <span className="block text-xs text-ink-muted">{f.about}</span>
                </span>
              </label>
            );
          })}
        </div>
        {format === 'naac' ? (
          <div className="border-t border-line px-4 py-3">
            <label htmlFor={`${id}-wb`} className="mb-1 block text-xs font-semibold text-ink-muted">Workbook</label>
            <Select id={`${id}-wb`} value={workbook} onChange={(e) => setWorkbook(e.target.value)} className="max-w-md">
              {opts.workbooks.map((w) => <option key={w.key} value={w.key}>{w.name} ({w.office})</option>)}
            </Select>
            <p className="mt-1 text-xs text-ink-muted">{opts.workbooks.find((w) => w.key === workbook)?.contents}</p>
          </div>
        ) : null}
      </Card>

      <Card padded={false}>
        <CardHeader title="2. Which years" subtitle="A year is counted by the year it starts in: 2022 to 2024 covers FY 2022-23 to FY 2024-25." />
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label htmlFor={`${id}-from`} className="mb-1 block text-xs font-semibold text-ink-muted">From year</label>
            <Select id={`${id}-from`} value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor={`${id}-to`} className="mb-1 block text-xs font-semibold text-ink-muted">To year</label>
            <Select id={`${id}-to`} value={to} onChange={(e) => setTo(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          <div className="min-w-64">
            <label htmlFor={`${id}-type`} className="mb-1 block text-xs font-semibold text-ink-muted">Year type</label>
            <Select id={`${id}-type`} value={yearType} onChange={(e) => setYearType(e.target.value as ReportYearType)}>
              {(Object.keys(YEAR_TYPE_LABEL) as ReportYearType[]).map((t) => <option key={t} value={t}>{YEAR_TYPE_LABEL[t]}</option>)}
            </Select>
          </div>
        </div>
        <p className="px-4 pb-3 text-xs text-ink-muted">
          {yearType === 'auto'
            ? `Publications, awards and similar sheets use ${span(lo, hi, 'CY')}; grants, consultancy and fellowships use ${span(lo, hi, 'FY')}; students guided and mentorship use ${span(lo, hi, 'AY')}.`
            : `Every sheet uses ${span(lo, hi, yearType)}. A record dated by a year alone (not a full date) appears only in sheets of its own year type.`}
        </p>
      </Card>

      <Card padded={false}>
        <CardHeader
          title="3. Which departments"
          subtitle={opts.scope === 'self' ? 'Your own records only.' : opts.scope === 'department' ? 'As head of department, you report on your own department.' : 'None ticked means every department.'}
        />
        <div className="flex flex-wrap gap-x-5 gap-y-2 p-4">
          {opts.departmentFixed
            ? <span className="text-sm font-semibold">{opts.scope === 'self' ? 'Your records' : opts.departments[0]?.name ?? 'Your department'}</span>
            : opts.departments.map((d) => (
              <label key={d.id} className="flex items-center gap-1.5 text-sm">
                <Checkbox checked={depts.has(d.id)} onChange={(e) => setDepts((s) => toggle(s, d.id, e.target.checked))} />
                {d.name}
              </label>
            ))}
        </div>
        {format === 'full' ? (
          <>
            <div className="border-t border-line px-4 pt-3 text-xs font-semibold text-ink-muted">Modules (none ticked means all {opts.modules.length})</div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 p-4">
              {opts.modules.map((m) => (
                <label key={m.key} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={mods.has(m.key)} onChange={(e) => setMods((s) => toggle(s, m.key, e.target.checked))} />
                  {m.name}
                </label>
              ))}
            </div>
          </>
        ) : null}
        {opts.canRevealPii ? (
          <div className="border-t border-line px-4 py-3">
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={pii} onChange={(e) => setPii(e.target.checked)} />
              Include full PAN and Aadhaar numbers (otherwise they are masked)
            </label>
            {pii ? (
              <div className="mt-2 max-w-xl">
                <label htmlFor={`${id}-reason`} className="mb-1 block text-xs font-semibold text-ink-muted">Why they are needed (kept in the activity log)</label>
                <Input id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: NAAC peer team visit, criterion 2.4" />
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card padded={false}>
        <CardHeader
          title="4. Check and download"
          subtitle="Approved records only. The file also has a sheet saying what it holds."
          actions={(
            <LinkButton
              href={summaryError || piiBlocked || !summary ? '#' : `/api/reports/${format}?${query}`}
              className={summaryError || piiBlocked || !summary ? 'pointer-events-none opacity-50' : ''}
            >
              <IconDownload width={14} height={14} />
              Download Excel
            </LinkButton>
          )}
        />
        {piiBlocked ? <Notice tone="warning" className="m-4">Write why the full numbers are needed (at least 10 characters).</Notice> : null}
        {summaryError ? <Notice tone="danger" className="m-4">{summaryError}</Notice> : null}
        {summary ? (
          <Table>
            <thead>
              <tr>
                <Th>Sheet</Th>
                <Th>Years</Th>
                <Th className="w-32 text-right">Rows</Th>
              </tr>
            </thead>
            <tbody>
              {summary.sheets.map((s) => (
                <tr key={`${s.sheet}-${s.moduleKey}-${s.part ?? ''}`}>
                  <Td>
                    <span className="font-semibold">{s.sheet}{s.part && s.part.toLowerCase() !== s.sheet.toLowerCase() ? ` · ${s.part}` : ''}</span>
                    {s.sheet !== s.moduleName ? <span className="block text-xs text-ink-muted">{s.moduleName}</span> : null}
                  </Td>
                  <Td className="text-xs text-ink-muted">
                    {s.dated ? `${TYPE_WORD[s.yearType]}: ${span(lo, hi, s.yearType)}` : 'Every year: one per person'}
                  </Td>
                  <Td className={`text-right font-mono tabular-nums ${s.rows === 0 ? 'text-ink-faint' : ''}`}>{s.rows}</Td>
                </tr>
              ))}
              <tr>
                <Td className="font-semibold">Total</Td>
                <Td />
                <Td className="text-right font-mono font-semibold tabular-nums">{summary.rows}</Td>
              </tr>
            </tbody>
          </Table>
        ) : !summaryError ? <p className="p-4 text-sm text-ink-muted">{loading ? 'Counting…' : ''}</p> : null}
      </Card>
    </div>
  );
}
