'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Button, Card, CardHeader, Checkbox, Input, Notice, Select, Table, Td, Th } from '@/components/ui';
import {
  QUALITY_LABEL, type QualityThresholds, type ResearchProfile, type ResearchQualityRow,
} from '@darp/shared/research';
import type { ReportOptions } from '@darp/shared/reports';

interface Payload { rows: ResearchQualityRow[]; range: { from: number; to: number }; thresholds: QualityThresholds; scopusConnected: boolean; wosConnected: boolean }

const n = (v: number | null) => (v === null ? 'NA' : v.toLocaleString('en-IN'));
const pct = (v: number | null) => (v === null ? 'NA' : `${v}%`);

type SortKey = 'name' | 'department' | 'docs' | 'citations' | 'h' | 'wosShare' | 'cites' | 'top' | 'label';
const LABEL_ORDER = { quality: 0, balanced: 1, volume: 2, unknown: 3 } as const;
const value = (r: ResearchQualityRow, k: SortKey): string | number => ({
  name: r.name, department: r.department,
  // A source sorts by Scopus, else Web of Science, else OpenAlex.
  docs: r.scopus?.documents ?? r.wos?.documents ?? r.openalex?.documents ?? -1,
  citations: r.scopus?.citations ?? r.wos?.citations ?? r.openalex?.citations ?? -1,
  h: r.scopus?.hIndex ?? r.wos?.hIndex ?? r.openalex?.hIndex ?? -1,
  wosShare: r.signal.wosShare ?? -1, cites: r.signal.citationsPerPaper ?? -1, top: r.signal.topShare ?? -1,
  label: LABEL_ORDER[r.signal.label],
})[k];

const THRESHOLD_FIELDS: Array<[keyof QualityThresholds, string]> = [
  ['qualityWosShare', 'Quality-leaning: WoS share at least (%)'],
  ['qualityTopShare', 'Quality-leaning: Q1+Q2 share at least (%)'],
  ['volumeDocuments', 'Volume-leaning: Scopus documents at least'],
  ['volumeTopShare', 'Volume-leaning: Q1+Q2 share under (%)'],
  ['volumeCitationsPerPaper', 'Volume-leaning: citations per paper under'],
  ['minDocuments', 'Not enough data: fewer documents than'],
];

/**
 * "Research quality": each faculty member's Scopus and Web of Science figures, the share of their
 * papers in Q1/Q2 journals, and the label worked out from them. Sortable by any column.
 */
export function ResearchQualityPanel({ isAdmin }: { isAdmin: boolean }) {
  const id = useId();
  const [opts, setOpts] = useState<ReportOptions | null>(null);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [depts, setDepts] = useState<Set<string>>(new Set());
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'h', desc: true });
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [limits, setLimits] = useState<QualityThresholds | null>(null);
  const [limitsMsg, setLimitsMsg] = useState<string | null>(null);

  useEffect(() => {
    void apiJson<ReportOptions>('/api/reports/options').then((r) => {
      if (!r.ok) { setError(r.error.message); return; }
      setOpts(r.data);
      setFrom(r.data.range.from);
      setTo(r.data.range.to);
    });
  }, []);

  const query = useMemo(() => {
    const q = new URLSearchParams({ from: String(Math.min(from, to)), to: String(Math.max(from, to)) });
    if (depts.size) q.set('departments', [...depts].join(','));
    return q.toString();
  }, [from, to, depts]);

  useEffect(() => {
    if (!from) return;
    void apiJson<Payload>(`/api/reports/research-quality?${query}`).then((r) => {
      if (!r.ok) { setError(r.error.message); return; }
      setError(null);
      setData(r.data);
      setLimits((l) => l ?? r.data.thresholds);
    });
  }, [query, from]);

  async function refresh(userId: string) {
    setBusyRow(userId);
    const r = await apiJson<ResearchProfile>('/api/profile/research/refresh', { method: 'POST', body: JSON.stringify({ userId }) });
    setBusyRow(null);
    if (!r.ok) { setError(r.error.message); return; }
    setData((d) => d && { ...d, rows: d.rows.map((x) => (x.userId === userId ? {
      ...x, signal: r.data.signal, scopus: r.data.scopus, wos: r.data.wos, openalex: r.data.openalex,
      scopusAuthorId: r.data.scopusAuthorId, researcherId: r.data.researcherId,
    } : x)) });
  }

  async function saveLimits() {
    if (!limits) return;
    const r = await apiJson<QualityThresholds>('/api/admin/research/thresholds', { method: 'PUT', body: JSON.stringify(limits) });
    if (!r.ok) { setLimitsMsg(Object.values(r.error.fields ?? {})[0] ?? r.error.message); return; }
    setLimitsMsg('Saved. The labels below now use these thresholds.');
    setData(null);
    const again = await apiJson<Payload>(`/api/reports/research-quality?${query}`);
    if (again.ok) setData(again.data);
  }

  if (error && !data) return <Notice tone="danger">{error}</Notice>;
  if (!opts || !data) return <p className="text-sm text-ink-muted">Loading…</p>;

  const years: number[] = [];
  for (let y = opts.years.max; y >= opts.years.min; y -= 1) years.push(y);
  const rows = [...data.rows].sort((a, b) => {
    const x = value(a, sort.key);
    const y = value(b, sort.key);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return sort.desc ? -c : c;
  });
  const head = (k: SortKey, label: string, cls = '') => (
    <Th className={cls}>
      <button type="button" className="font-semibold hover:text-ink" onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : k !== 'name' && k !== 'department' }))}>
        {label}{sort.key === k ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </Th>
  );

  return (
    <div className="grid gap-4">
      {!data.scopusConnected || !data.wosConnected ? (
        <Notice tone="warning" title="Not every source is connected yet">
          {!data.scopusConnected ? 'Scopus needs BIT’s Elsevier API key. ' : ''}
          {!data.wosConnected ? 'Web of Science needs BIT’s Clarivate API key (until then faculty type their WoS figures). ' : ''}
          OpenAlex works now for everyone who has added an ORCID iD. The IDs are read from ORCID already, so the figures appear as
          soon as each key is in place.
        </Notice>
      ) : null}

      <Card padded={false}>
        <CardHeader title="Research quality" subtitle="Click a column heading to sort. Citation habits differ by subject; compare within a department." />
        <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
          <div>
            <label htmlFor={`${id}-from`} className="mb-1 block text-xs font-semibold text-ink-muted">Papers from</label>
            <Select id={`${id}-from`} value={from} onChange={(e) => setFrom(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</Select>
          </div>
          <div>
            <label htmlFor={`${id}-to`} className="mb-1 block text-xs font-semibold text-ink-muted">to</label>
            <Select id={`${id}-to`} value={to} onChange={(e) => setTo(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</Select>
          </div>
          {!opts.departmentFixed ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pb-1">
              {opts.departments.map((d) => (
                <label key={d.id} className="flex items-center gap-1.5 text-xs">
                  <Checkbox checked={depts.has(d.id)} onChange={(e) => setDepts((s) => { const x = new Set(s); if (e.target.checked) x.add(d.id); else x.delete(d.id); return x; })} />
                  {d.name}
                </label>
              ))}
            </div>
          ) : <span className="pb-1 text-sm font-semibold">{opts.departments[0]?.name}</span>}
        </div>
        {error ? <Notice tone="danger" className="m-4">{error}</Notice> : null}
        <Table>
          <thead>
            <tr>
              {head('name', 'Name')}
              {head('department', 'Department')}
              {head('docs', 'Publications (S · W · O)', 'text-right')}
              {head('citations', 'Citations (S · W · O)', 'text-right')}
              {head('h', 'h-index (S · W · O)', 'text-right')}
              {head('wosShare', 'WoS share', 'text-right')}
              {head('cites', 'Citations / paper', 'text-right')}
              {head('top', `Q1+Q2 ${data.range.from}–${data.range.to}`, 'text-right')}
              {head('label', 'Profile')}
              {isAdmin ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId}>
                <Td className="font-semibold">
                  {r.name}
                  {r.scopusTyped || r.wosEvidenceId ? (
                    <span className="ml-1 rounded-xs border border-line bg-surface-2 px-1 text-2xs font-semibold text-ink-muted" title="Some figures were typed by the person, with a screenshot.">
                      typed
                    </span>
                  ) : null}
                  {isAdmin && r.scopusEvidenceId ? (
                    <a className="ml-1 text-2xs underline" target="_blank" rel="noreferrer" href={`/api/evidence/${r.scopusEvidenceId}`}>Scopus screenshot</a>
                  ) : null}
                  {isAdmin && r.wosEvidenceId ? (
                    <a className="ml-1 text-2xs underline" target="_blank" rel="noreferrer" href={`/api/evidence/${r.wosEvidenceId}`}>WoS screenshot</a>
                  ) : null}
                  {r.scopus?.verified === false || r.wos?.verified === false ? (
                    <span className="ml-1 rounded-xs border border-warning-100 bg-warning-50 px-1 text-2xs font-semibold text-warning-700"
                      title="The Scopus or Web of Science ID could not be matched to this person's name. Check it.">
                      not verified
                    </span>
                  ) : null}
                </Td>
                <Td className="text-xs text-ink-muted">{r.department}</Td>
                {(['documents', 'citations', 'hIndex'] as const).map((k) => (
                  <Td key={k} className="whitespace-nowrap text-right font-mono tabular-nums">
                    {n(r.scopus?.[k] ?? null)} · {n(r.wos?.[k] ?? null)} · {n(r.openalex?.[k] ?? null)}
                  </Td>
                ))}
                <Td className="text-right font-mono tabular-nums">{pct(r.signal.wosShare)}</Td>
                <Td className="text-right font-mono tabular-nums">
                  {n(r.signal.citationsPerPaper)}{r.signal.citationsInclSelf ? <span className="text-2xs text-ink-faint"> incl. self</span> : null}
                </Td>
                <Td className="text-right font-mono tabular-nums">{r.signal.papers ? `${r.signal.topPapers}/${r.signal.papers} (${pct(r.signal.topShare)})` : 'NA'}</Td>
                <Td className={r.signal.label === 'unknown' ? 'text-ink-muted' : 'font-semibold'}>{QUALITY_LABEL[r.signal.label]}</Td>
                {isAdmin ? (
                  <Td>
                    {r.orcid || r.scopusAuthorId || r.researcherId ? (
                      <Button variant="ghost" className="min-h-8 px-2 text-xs" disabled={busyRow !== null} onClick={() => void refresh(r.userId)}>
                        {busyRow === r.userId ? 'Fetching…' : 'Refresh now'}
                      </Button>
                    ) : <span className="text-2xs text-ink-faint">no ORCID iD</span>}
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="px-4 py-2.5 text-2xs text-ink-muted">
          S · W · O = Scopus · Web of Science · OpenAlex. The IDs come from each person’s ORCID record; OpenAlex is found by the
          ORCID iD and counts more sources, so its numbers run higher. WoS share = WoS documents ÷ Scopus documents (at most 100%). Citations per paper are without self-citations when Elsevier’s
          Citation Overview is enabled for BIT, otherwise with them (marked “incl. self”). Q1+Q2 = approved DARP papers in the years
          chosen whose journal is Q1 or Q2 by SJR or JIF.
        </p>
      </Card>

      {isAdmin && limits ? (
        <details className="rounded-sm border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Thresholds for the labels</summary>
          <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-3">
            {THRESHOLD_FIELDS.map(([k, label]) => (
              <div key={k}>
                <label htmlFor={`${id}-${k}`} className="mb-1 block text-xs font-semibold text-ink-muted">{label}</label>
                <Input id={`${id}-${k}`} inputMode="decimal" value={String(limits[k])}
                  onChange={(e) => setLimits((l) => l && { ...l, [k]: Number(e.target.value.replace(/[^\d.]/g, '') || 0) })} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 border-t border-line px-4 py-3">
            <Button variant="secondary" onClick={() => void saveLimits()}>Save thresholds</Button>
            {limitsMsg ? <span className="text-xs text-ink-muted">{limitsMsg}</span> : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
