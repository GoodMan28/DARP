'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import {
  Button, Card, CardHeader, EmptyState, Field, Input, Notice, Select, Table, Td, Th,
} from '@/components/ui';
import {
  parseCsv, extractSjrRows, extractListRows, type JournalListRow,
} from '@darp/shared/journals';
import type { JournalListsPayload } from './types';

/** Rows per request: well under the API's 1 MB JSON cap. */
const BATCH = 4000;

type Kind = 'sjr' | 'list';

/**
 * Where the quartile and indexing on Publications come from. IQAC downloads the yearly files and
 * loads them here; the file is read in the browser and only the ISSN rows are sent.
 */
export function JournalListsPanel() {
  const [data, setData] = useState<JournalListsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>('sjr');
  const [listName, setListName] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await apiJson<JournalListsPayload>('/api/admin/journal-lists');
    if (!res.ok) { setLoadError(res.error.message); return; }
    setData(res.data);
    setListName((prev) => prev || (res.data.listNames.find((n) => n !== 'Scopus') ?? res.data.listNames[0] ?? ''));
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function importFile() {
    if (!file) return;
    const y = Number(year);
    if (!Number.isInteger(y) || y < 1999 || y > 2100) {
      setResult({ tone: 'danger', text: 'Enter the year as four digits, for example 2024.' });
      return;
    }
    setBusy(true);
    setResult(null);
    setProgress('Reading the file…');

    const extracted = (kind === 'sjr' ? extractSjrRows : extractListRows)(parseCsv(await file.text()));
    if (!extracted.ok) {
      setBusy(false);
      setProgress(null);
      setResult({ tone: 'danger', text: extracted.message });
      return;
    }

    const rows: JournalListRow[] = extracted.rows;
    for (let i = 0; i < rows.length; i += BATCH) {
      setProgress(`Saving ${Math.min(i + BATCH, rows.length).toLocaleString('en-IN')} of ${rows.length.toLocaleString('en-IN')} ISSNs…`);
      const last = i + BATCH >= rows.length;
      const res = await apiJson('/api/admin/journal-lists', {
        method: 'POST',
        body: JSON.stringify({
          action: 'import', kind, year: y, listName: kind === 'list' ? listName : undefined,
          rows: rows.slice(i, i + BATCH), last, totalRows: rows.length, fileName: file.name,
        }),
      });
      if (!res.ok) {
        setBusy(false);
        setProgress(null);
        setResult({ tone: 'danger', text: `Stopped after ${i.toLocaleString('en-IN')} ISSNs: ${res.error.message}` });
        await load();
        return;
      }
    }

    setBusy(false);
    setProgress(null);
    setFile(null);
    setResult({
      tone: 'success',
      text: `Loaded ${extracted.journals.toLocaleString('en-IN')} journals (${rows.length.toLocaleString('en-IN')} ISSNs) as ${kind === 'sjr' ? `SJR ${y}` : `${listName} ${y}`}. Fetch details now uses them.`,
    });
    await load();
  }

  async function clear(k: Kind, y: number, name?: string) {
    const label = k === 'sjr' ? `SJR ${y}` : `${name} ${y}`;
    if (!window.confirm(`Remove ${label}? Records already saved keep their values.`)) return;
    setBusy(true);
    const res = await apiJson('/api/admin/journal-lists', {
      method: 'POST', body: JSON.stringify({ action: 'clear', kind: k, year: y, listName: name }),
    });
    setBusy(false);
    setResult(res.ok ? { tone: 'success', text: `${label} removed.` } : { tone: 'danger', text: res.error.message });
    await load();
  }

  if (loadError) return <Notice tone="danger" title="Journal lists could not be loaded">{loadError}</Notice>;
  if (!data) return <p className="text-sm text-ink-muted">Loading journal lists…</p>;

  const nothingLoaded = data.sjr.length === 0 && data.lists.length === 0;

  return (
    <div className="space-y-4">
      {nothingLoaded ? (
        <Notice tone="warning" title="No journal list is loaded yet">
          Until one is, Publications cannot fill in the quartile or the indexing, and every paper goes to
          DRIE for a manual check. Load at least the latest SCImago SJR file.
        </Notice>
      ) : null}

      <Card padded={false}>
        <CardHeader
          title="Load a journal list"
          subtitle="Once a year per list. The file is read on this computer; only the ISSNs are sent."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="List" htmlFor="jl-kind">
            <Select id="jl-kind" value={kind} disabled={busy} onChange={(e) => setKind(e.target.value as Kind)}>
              <option value="sjr">SCImago Journal Rank (quartile, and Scopus coverage)</option>
              <option value="list">An indexing list (Web of Science collection)</option>
            </Select>
          </Field>
          {kind === 'list' ? (
            <Field label="Index" htmlFor="jl-name" help="Values come from the Indexing master list.">
              <Select id="jl-name" value={listName} disabled={busy} onChange={(e) => setListName(e.target.value)}>
                {data.listNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
          ) : null}
          <Field
            label="Year"
            htmlFor="jl-year"
            help={kind === 'sjr' ? 'The SJR edition year chosen on the SCImago site.' : 'The year you downloaded the list.'}
          >
            <Input id="jl-year" inputMode="numeric" maxLength={4} value={year} disabled={busy}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="CSV file" htmlFor="jl-file">
            <input
              id="jl-file"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <Button type="button" disabled={busy || !file || (kind === 'list' && !listName)} onClick={() => void importFile()}>
            {busy ? 'Loading…' : 'Load list'}
          </Button>
          {progress ? <span className="text-sm text-ink-muted">{progress}</span> : null}
        </div>
        {result ? (
          <div className="px-4 pb-4">
            <Notice tone={result.tone} title={result.tone === 'success' ? 'Done' : 'The list was not loaded'}>{result.text}</Notice>
          </div>
        ) : null}
        <div className="border-t border-line px-4 py-3 text-xs text-ink-muted">
          <p>
            <strong>SCImago SJR:</strong> open scimagojr.com → Journal Rankings, choose the year, and use
            “Download data” at the bottom of the page. Free for non-commercial use with citation —
            DARP shows “Source: SCImago Journal Rank” beside every quartile.
          </p>
          <p className="mt-1">
            <strong>Web of Science:</strong> sign in at mjl.clarivate.com (free account), filter by one collection
            (SCIE, SSCI, AHCI or ESCI) and download the CSV. Load each collection under its own Index.
          </p>
        </div>
      </Card>

      <Card padded={false}>
        <CardHeader title="Loaded lists" subtitle="Quartile uses the SJR edition of the publication year, else the nearest earlier one." />
        {nothingLoaded ? (
          <EmptyState title="Nothing loaded yet">Load a file above.</EmptyState>
        ) : (
          <Table>
            <caption className="sr-only">Journal lists loaded into DARP</caption>
            <thead>
              <tr><Th>List</Th><Th>Year</Th><Th>ISSNs</Th><Th>Note</Th><Th>Actions</Th></tr>
            </thead>
            <tbody>
              {data.sjr.map((s) => (
                <tr key={`sjr-${s.year}`}>
                  <Td>SCImago SJR</Td>
                  <Td>{s.year}</Td>
                  <Td>{s.issns.toLocaleString('en-IN')}</Td>
                  <Td className="text-xs text-ink-muted">{s.ranked.toLocaleString('en-IN')} with a quartile</Td>
                  <Td><Button type="button" variant="ghost" disabled={busy} onClick={() => void clear('sjr', s.year)}>Remove</Button></Td>
                </tr>
              ))}
              {data.lists.map((l) => (
                <tr key={`${l.listName}-${l.year}`}>
                  <Td>{l.listName}</Td>
                  <Td>{l.year}</Td>
                  <Td>{l.issns.toLocaleString('en-IN')}</Td>
                  <Td className="text-xs text-ink-muted">Indexing list</Td>
                  <Td><Button type="button" variant="ghost" disabled={busy} onClick={() => void clear('list', l.year, l.listName)}>Remove</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
