'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { cx } from '@/lib/cx';
import { Button, Card, CardHeader, Input, Notice, Select, Table, Td, Th } from '@/components/ui';
import { IconAlert, IconCheck, IconClock, IconUpload } from '@/components/shell/Icon';
import {
  parseCsv, extractSjrRows, extractListRows, extractJcrRows, detectJournalFile,
  type JournalListRow, type JcrRow,
} from '@darp/shared/journals';
import { readXlsx } from '@darp/shared/sheets';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { JcrPdfCard } from './JcrPdfCard';
import type { JournalListsPayload } from './types';

/** Rows per request: well under the API's 1 MB JSON cap. */
const BATCH = 4000;

type Kind = 'sjr' | 'list' | 'jcr';

/** What the short Web of Science names stand for. */
const FULL_NAME: Record<string, string> = {
  SCIE: 'Science Citation Index Expanded',
  SSCI: 'Social Sciences Citation Index',
  AHCI: 'Arts & Humanities Citation Index',
  ESCI: 'Emerging Sources Citation Index',
};

const fmt = (n: number) => n.toLocaleString('en-IN');
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

/** A file dropped on the upload box, read in this browser before anything is sent. */
interface Pending {
  id: number;
  file: File;
  table: string[][] | null;
  /** 'sjr', 'jcr', or 'list:SCIE'; '' until known. */
  choice: string;
  year: string;
  /** Rows ready to send, or why the file cannot be used as chosen. */
  rows: JournalListRow[] | JcrRow[] | null;
  journals: number;
  /** Impact Factor files: the JIF year printed in the file. */
  jifYear?: number;
  problem: string | null;
  state: 'ready' | 'uploading' | 'done' | 'failed';
  note: string;
}

/** The browser's own zip inflater and UTF-8 decoder, for reading .xlsx files. */
const browserIo = {
  inflateRaw: async (d: Uint8Array) => new Uint8Array(
    await new Response(new Blob([new Uint8Array(d)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer(),
  ),
  utf8: (d: Uint8Array) => new TextDecoder().decode(d),
};

async function readTable(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) return readXlsx(new Uint8Array(await file.arrayBuffer()), browserIo);
  if (/\.xls$/i.test(file.name)) throw new Error('This is an old Excel (.xls) file. Open it in Excel and save it as .xlsx or .csv.');
  return parseCsv(await file.text());
}

/** The rows of a file read as the chosen kind, or why it cannot be. */
function extract(table: string[][], choice: string): Pick<Pending, 'rows' | 'journals' | 'problem'> & { jifYear?: number } {
  if (!choice) return { rows: null, journals: 0, problem: 'Choose what this file is.' };
  if (choice === 'jcr') {
    const r = extractJcrRows(table);
    return r.ok ? { rows: r.rows, journals: r.journals, problem: null, jifYear: r.jifYear } : { rows: null, journals: 0, problem: r.message };
  }
  const r = (choice === 'sjr' ? extractSjrRows : extractListRows)(table);
  return r.ok ? { rows: r.rows, journals: r.journals, problem: null } : { rows: null, journals: 0, problem: r.message };
}

const kindOf = (choice: string): Kind => (choice === 'sjr' ? 'sjr' : choice === 'jcr' ? 'jcr' : 'list');
const listOf = (choice: string) => (choice.startsWith('list:') ? choice.slice(5) : undefined);
const choiceLabel = (choice: string) => {
  if (choice === 'sjr') return 'SCImago Journal Rank (quartiles)';
  if (choice === 'jcr') return 'Journal Citation Reports (Impact Factor)';
  const n = listOf(choice) ?? '';
  return FULL_NAME[n] ? `${n} · ${FULL_NAME[n]}` : n;
};

/**
 * Where the indexing, quartile and Impact Factor shown on Publications come from, and the index
 * patents are fetched from. Two are automatic; the rest IQAC uploads. Files are read in this
 * browser and only the ISSN rows are sent. Nothing is stored on the papers, so a list uploaded here
 * counts for every paper at once.
 */
export function JournalListsPanel() {
  const [data, setData] = useState<JournalListsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<{ k: Kind; y: number; name?: string } | null>(null);
  const [result, setResult] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await apiJson<JournalListsPayload>('/api/admin/journal-lists');
    if (!res.ok) { setLoadError(res.error.message); return; }
    setData(res.data);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const wosNames = (data?.listNames ?? []).filter((n) => n !== 'Scopus');
  const thisYear = String(new Date().getFullYear());

  async function addFiles(files: File[]) {
    if (!data || files.length === 0) return;
    setResult(null);
    const added: Pending[] = [];
    for (const file of files) {
      const base: Pending = {
        id: nextId.current++, file, table: null, choice: '', year: thisYear,
        rows: null, journals: 0, problem: null, state: 'ready', note: '',
      };
      try {
        const table = await readTable(file);
        const found = detectJournalFile(file.name, table, data.listNames);
        if (found.kind === 'unknown') { added.push({ ...base, table, problem: found.message }); continue; }
        const choice = found.kind === 'list' ? (found.listName ? `list:${found.listName}` : '') : found.kind;
        const year = found.kind === 'sjr' ? String(found.year ?? '') : thisYear;
        added.push({ ...base, table, choice, year, ...extract(table, choice) });
      } catch (e) {
        added.push({ ...base, problem: e instanceof Error ? e.message : 'This file could not be read.' });
      }
    }
    setPending((prev) => [...prev.filter((p) => p.state !== 'done'), ...added]);
  }

  function change(id: number, patch: Partial<Pick<Pending, 'choice' | 'year'>>) {
    setPending((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const next = { ...p, ...patch, state: 'ready' as const, note: '' };
      return next.table && patch.choice !== undefined ? { ...next, ...extract(next.table, next.choice) } : next;
    }));
  }

  /** Why a file cannot be uploaded yet, or null. */
  function blocker(p: Pending, all: Pending[]): string | null {
    if (p.problem) return p.problem;
    if (!p.rows) return 'Choose what this file is.';
    const k = kindOf(p.choice);
    if (k !== 'jcr' && !/^(19|20)\d{2}$/.test(p.year)) return 'Enter the year, for example 2026.';
    if (k === 'list' && all.some((o) => o.id < p.id && o.state !== 'done' && o.choice === p.choice && o.year === p.year)) {
      return `Another file here is also ${listOf(p.choice)} ${p.year}. Remove one of them.`;
    }
    return null;
  }

  const set = (id: number, patch: Partial<Pending>) => setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  async function uploadOne(p: Pending): Promise<boolean> {
    const rows = p.rows!;
    const k = kindOf(p.choice);
    for (let i = 0; i < rows.length; i += BATCH) {
      set(p.id, { state: 'uploading', note: `Saving ${fmt(Math.min(i + BATCH, rows.length))} of ${fmt(rows.length)} ISSNs…` });
      const last = i + BATCH >= rows.length;
      const body = k === 'jcr'
        // The first file of a year replaces what was loaded for it, so a corrected list changes every figure.
        ? {
          action: 'importJcr', jifYear: p.jifYear, rows: rows.slice(i, i + BATCH), last, totalRows: rows.length, fileName: p.file.name,
          replace: i === 0 && pending.find((x) => kindOf(x.choice) === 'jcr' && x.jifYear === p.jifYear)?.id === p.id,
        }
        : {
          action: 'import', kind: k, year: Number(p.year), listName: listOf(p.choice), rows: rows.slice(i, i + BATCH),
          replace: i === 0, last, totalRows: rows.length, fileName: p.file.name,
        };
      const res = await apiJson('/api/admin/journal-lists', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) {
        set(p.id, { state: 'failed', note: `Stopped after ${fmt(i)} ISSNs: ${res.error.message}` });
        return false;
      }
    }
    set(p.id, { state: 'done', note: `${fmt(p.journals)} journals saved.` });
    return true;
  }

  async function uploadAll() {
    const ready = pending.filter((p) => p.state !== 'done' && blocker(p, pending) === null);
    if (ready.length === 0) return;
    setBusy(true);
    setResult(null);
    let done = 0;
    for (const p of ready) if (await uploadOne(p)) done += 1;
    setBusy(false);
    setResult(done === ready.length
      ? { tone: 'success', text: `${done} ${done === 1 ? 'file' : 'files'} uploaded. Every paper in these journals now shows them.` }
      : { tone: 'danger', text: `${done} of ${ready.length} files uploaded. See the file marked “Failed”.` });
    await load();
  }

  async function sync(action: 'syncScopus' | 'syncPatents' | 'syncCitations') {
    setBusy(true);
    setResult(null);
    const res = await apiJson<unknown>('/api/admin/journal-lists', { method: 'POST', body: JSON.stringify({ action }) });
    setBusy(false);
    setResult(res.ok
      ? { tone: 'success', text: action === 'syncScopus' ? 'The Scopus list was checked and is up to date.' : action === 'syncCitations' ? 'Asking Scopus for the papers’ citations in the background. Reload in a minute.' : 'Reading new Patent Office Journal issues in the background. Reload this page later to see them.' }
      : { tone: 'danger', text: res.error.message });
    await load();
  }

  async function setHIndexPapers(value: 'all' | 'at-bit') {
    setBusy(true);
    setResult(null);
    const res = await apiJson<unknown>('/api/admin/journal-lists', { method: 'POST', body: JSON.stringify({ action: 'setHIndexPapers', value }) });
    setBusy(false);
    setResult(res.ok ? { tone: 'success', text: value === 'all' ? 'The h-index now counts all papers.' : 'The h-index now counts only papers done at BIT.' } : { tone: 'danger', text: res.error.message });
    await load();
  }

  const labelOf = (k: Kind, y: number, name?: string) => (k === 'sjr' ? `SCImago SJR ${y}` : k === 'jcr' ? `Impact Factors (JCR ${y})` : `${name} ${y}`);

  async function clear(k: Kind, y: number, name?: string) {
    const label = labelOf(k, y, name);
    setRemoving(null);
    setBusy(true);
    const res = await apiJson('/api/admin/journal-lists', {
      method: 'POST', body: JSON.stringify({ action: 'clear', kind: k, year: y, listName: name }),
    });
    setBusy(false);
    setResult(res.ok ? { tone: 'success', text: `${label} removed.` } : { tone: 'danger', text: res.error.message });
    await load();
  }

  if (loadError) return <Notice tone="danger" title="This page could not be loaded">{loadError}</Notice>;
  if (!data) return <p className="text-sm text-ink-muted">Loading…</p>;

  // The newest upload of each list: that is what papers use.
  const newestList = (name: string) => data.lists.filter((l) => l.listName === name && l.source === 'upload').sort((a, b) => b.year - a.year)[0];
  const scimago = data.sjr.filter((s) => s.source === 'scimago').sort((a, b) => b.year - a.year)[0];
  const jcr = [...data.jcr].sort((a, b) => b.jifYear - a.jifYear)[0];
  const s = data.scopus;
  const pt = data.patents;
  const uploadable = pending.filter((p) => p.state !== 'done' && blocker(p, pending) === null).length;
  const uploads = [
    ...data.sjr.filter((x) => x.source === 'scimago').map((x) => ({ key: `sjr-${x.year}`, label: 'SCImago SJR', year: x.year, count: x.issns, at: x.importedAt, remove: { k: 'sjr' as Kind, y: x.year } })),
    ...data.lists.filter((x) => x.source === 'upload').map((x) => ({ key: `l-${x.listName}-${x.year}`, label: x.listName, year: x.year, count: x.issns, at: x.importedAt, remove: { k: 'list' as Kind, y: x.year, name: x.listName } })),
    ...data.jcr.map((x) => ({ key: `jcr-${x.jifYear}`, label: 'Impact Factors (JCR)', year: x.jifYear, count: x.issns, at: x.importedAt, remove: { k: 'jcr' as Kind, y: x.jifYear } })),
  ];

  return (
    <div className="space-y-4">
      {/* 1 ── what is in place today */}
      <Card padded={false}>
        <CardHeader
          title="What papers and patents are checked against"
          subtitle="Green means it is in place. Anything missing shows as NA on the papers until it is uploaded."
        />
        <Table>
          <caption className="sr-only">Journal and patent sources</caption>
          <thead>
            <tr><Th>Source</Th><Th>What it gives</Th><Th>How it gets here</Th><Th>Status</Th><Th><span className="sr-only">Action</span></Th></tr>
          </thead>
          <tbody>
            <SourceRow
              name="Scopus"
              gives="Indexing “Scopus”, and the quartile (estimated)"
              how="Automatic, every night"
              state={s ? 'ok' : 'missing'}
              status={s ? `${MONTHS[s.listMonth - 1]} ${s.listYear} list · ${fmt(s.indexed)} journals` : 'Not fetched yet'}
              action={<Button type="button" variant="ghost" disabled={busy} onClick={() => void sync('syncScopus')}>Check now</Button>}
            />
            <SourceRow
              name="SCImago SJR"
              gives="The official quartile (replaces the estimate)"
              how="You upload, once a year"
              state={scimago ? 'ok' : 'optional'}
              status={scimago ? `${scimago.year} edition · uploaded ${day(scimago.importedAt)}` : 'Not uploaded: quartiles are estimated'}
            />
            {wosNames.map((n) => {
              const l = newestList(n);
              return (
                <SourceRow
                  key={n}
                  name={n}
                  full={FULL_NAME[n]}
                  gives={`Indexing “${n}”`}
                  how="You upload (Web of Science)"
                  state={l ? 'ok' : 'missing'}
                  status={l ? `${l.year} list · ${fmt(l.issns)} ISSNs · uploaded ${day(l.importedAt)}` : 'Not uploaded'}
                />
              );
            })}
            <SourceRow
              name="Impact Factor"
              full="Journal Citation Reports"
              gives="Impact Factor and JIF quartile"
              how="Library exports it, once a year (after June)"
              state={jcr ? 'ok' : 'missing'}
              status={jcr ? `JIF ${jcr.jifYear} · ${fmt(jcr.journals || jcr.withJif)} journals` : 'Not uploaded: Impact Factor shows NA'}
            />
            <SourceRow
              name="Citations"
              full="Scopus, by DOI"
              gives="Each paper’s citations, for the department and college h-index"
              how="Automatic, every paper every night"
              state={!data.citations.connected ? 'optional' : data.citations.found > 0 ? 'ok' : 'missing'}
              status={!data.citations.connected
                ? 'Elsevier is not connected: no API key'
                : data.citations.total === 0 ? 'No papers with a DOI yet'
                  : `${fmt(data.citations.found)} of ${fmt(data.citations.total)} papers found in Scopus · ${fmt(data.citations.checked)} checked${data.citations.lastChecked ? ` · last ${day(data.citations.lastChecked)}` : ''}`}
              action={<Button type="button" variant="ghost" disabled={busy || !data.citations.connected} onClick={() => void sync('syncCitations')}>Refresh now</Button>}
            />
            <SourceRow
              name="Patents"
              full="Patent Office Journal, IP India"
              gives="Patent details for Fetch, and Published/Granted status"
              how="Automatic, every night"
              state={pt.running ? 'running' : pt.newestIssue ? 'ok' : 'missing'}
              status={pt.running
                ? 'Reading new issues now…'
                : pt.newestIssue ? `Up to issue ${pt.newestIssue.issue} (${day(pt.newestIssue.date)}) · ${fmt(pt.grants)} grants` : 'Not read yet'}
              action={<Button type="button" variant="ghost" disabled={busy || pt.running} onClick={() => void sync('syncPatents')}>Check now</Button>}
            />
          </tbody>
        </Table>
      </Card>

      {/* The department and college h-index: which papers it counts */}
      <Card padded={false}>
        <CardHeader title="Department h-index" subtitle="Worked out from the Scopus citations of the papers of a department or the college. Choose which papers it counts." />
        <div className="flex flex-wrap gap-4 px-4 pt-3 text-sm" role="radiogroup" aria-label="Department h-index counts">
          {([['all', 'All papers'], ['at-bit', 'Only papers done at BIT']] as const).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio" name="hindex-papers" value={value} checked={data.hIndexPapers === value} disabled={busy}
                onChange={() => void setHIndexPapers(value)}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="px-4 pb-3 pt-2 text-xs text-ink-muted">“All papers” also counts those a person answered “No” to “done at BIT?”. Other figures never count them.</p>
      </Card>

      {/* 2 ── the Journal Citation Reports PDF */}
      <JcrPdfCard onDone={() => void load()} />

      {/* 3 ── upload */}
      <Card padded={false}>
        <CardHeader
          title="Upload journal files"
          subtitle="Drop the Web of Science files (SCIE, SSCI, AHCI, ESCI) all together. SCImago and Impact Factor files go here too. CSV or Excel."
        />
        <div className="space-y-3 p-4">
          <label
            htmlFor="jl-files"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles([...e.dataTransfer.files]); }}
            className={cx(
              'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed px-4 py-8 text-center',
              dragging ? 'border-primary bg-surface-2' : 'border-line-strong hover:bg-surface-2',
              busy && 'pointer-events-none opacity-50',
            )}
          >
            <IconUpload width={22} height={22} />
            <span className="text-sm font-semibold text-ink">Drop files here, or click to choose them</span>
            <span className="text-xs text-ink-muted">You can choose several at once. DARP works out which list each file is.</span>
          </label>
          <input
            ref={inputRef}
            id="jl-files"
            type="file"
            multiple
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={busy}
            onChange={(e) => { void addFiles([...(e.target.files ?? [])]); if (inputRef.current) inputRef.current.value = ''; }}
          />

          {pending.length > 0 ? (
            <div className="rounded-sm border border-line">
              <Table>
                <caption className="sr-only">Files to upload</caption>
                <thead>
                  <tr><Th>File</Th><Th>This file is</Th><Th>Year</Th><Th>Journals</Th><Th>Status</Th><Th><span className="sr-only">Remove</span></Th></tr>
                </thead>
                <tbody>
                  {pending.map((p) => {
                    const why = p.state === 'done' ? null : blocker(p, pending);
                    const k = p.choice ? kindOf(p.choice) : null;
                    const locked = busy || p.state === 'done' || p.state === 'uploading';
                    return (
                      <tr key={p.id}>
                        <Td className="max-w-56 break-words text-xs font-semibold">{p.file.name}</Td>
                        <Td>
                          {p.table ? (
                            <Select
                              aria-label={`What ${p.file.name} is`}
                              value={p.choice}
                              disabled={locked}
                              onChange={(e) => change(p.id, { choice: e.target.value })}
                              className="min-w-60"
                            >
                              <option value="">Choose…</option>
                              {wosNames.map((n) => <option key={n} value={`list:${n}`}>{choiceLabel(`list:${n}`)}</option>)}
                              <option value="sjr">{choiceLabel('sjr')}</option>
                              <option value="jcr">{choiceLabel('jcr')}</option>
                            </Select>
                          ) : <span className="text-xs text-ink-muted">—</span>}
                        </Td>
                        <Td>
                          {k === 'jcr' ? (
                            <span className="text-xs text-ink-muted">{p.jifYear ? `JIF ${p.jifYear}` : 'From the file'}</span>
                          ) : k ? (
                            <Input
                              aria-label={`Year of ${p.file.name}`}
                              className="w-20"
                              inputMode="numeric"
                              maxLength={4}
                              value={p.year}
                              disabled={locked}
                              onChange={(e) => change(p.id, { year: e.target.value.replace(/\D/g, '') })}
                            />
                          ) : null}
                        </Td>
                        <Td className="text-xs">{p.rows ? fmt(p.journals) : '—'}</Td>
                        <Td className="text-xs">
                          {p.state === 'done' ? <span className="font-semibold text-success-700">✓ {p.note}</span>
                            : p.state === 'uploading' ? <span className="text-ink-muted">{p.note}</span>
                              : p.state === 'failed' ? <span className="text-danger-700"><strong>Failed.</strong> {p.note}</span>
                                : why ? <span className="text-warning-700">{why}</span>
                                  : <span className="text-ink-muted">Ready</span>}
                        </Td>
                        <Td>
                          {p.state !== 'uploading' ? (
                            <Button type="button" variant="ghost" disabled={busy} onClick={() => setPending((prev) => prev.filter((o) => o.id !== p.id))}>
                              {p.state === 'done' ? 'Clear' : 'Remove'}
                            </Button>
                          ) : null}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          ) : null}

          {pending.some((p) => p.state !== 'done') ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" disabled={busy || uploadable === 0} onClick={() => void uploadAll()}>
                {busy ? 'Uploading…' : `Upload ${uploadable} ${uploadable === 1 ? 'file' : 'files'}`}
              </Button>
              <span className="text-xs text-ink-muted">
                Uploading a list again for the same year replaces it. Papers always use the newest year.
              </span>
            </div>
          ) : null}

          {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}

          <details className="rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold text-ink">Where do I get these files?</summary>
            <div className="mt-2 space-y-3 text-xs text-ink-muted">
              <HowTo title="Web of Science lists (SCIE, SSCI, AHCI, ESCI): every 3 months">
                <li>Sign in at <strong>mjl.clarivate.com</strong> (a free account).</li>
                <li>Download each collection’s list as CSV. Keep Clarivate’s file names, such as “Science Citation Index Expanded (SCIE).csv”, so DARP can tell them apart.</li>
                <li>Drop all four files above together.</li>
              </HowTo>
              <HowTo title="SCImago SJR (official quartiles): once a year">
                <li>Open <strong>scimagojr.com</strong> → Journal Rankings and choose the newest year.</li>
                <li>Press “Download data” at the bottom of the page and drop the file above. Optional: without it, quartiles are estimated from the Scopus list.</li>
              </HowTo>
              <HowTo title="Impact Factor (Journal Citation Reports): once a year, after June">
                <li>Ask the library: they sign in to <strong>jcr.clarivate.com</strong> with BIT’s subscription.</li>
                <li>Choose the latest year and all editions, then Export → CSV. Several exports (one per category) are fine. Drop them above.</li>
              </HowTo>
              <p>Clarivate and SCImago do not allow automatic downloading, so these are done by hand. Scopus and patents are fetched by the server on its own.</p>
            </div>
          </details>
        </div>
      </Card>

      {/* 3 ── everything uploaded, for removing a mistake */}
      <details className="rounded-sm border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
          Uploaded files ({uploads.length}) <span className="font-normal text-ink-muted">— to remove one uploaded by mistake</span>
        </summary>
        {uploads.length === 0 ? (
          <p className="border-t border-line px-4 py-3 text-sm text-ink-muted">Nothing uploaded yet.</p>
        ) : (
          <Table>
            <caption className="sr-only">Uploaded journal lists</caption>
            <thead><tr><Th>List</Th><Th>Year</Th><Th>ISSNs</Th><Th>Uploaded</Th><Th><span className="sr-only">Remove</span></Th></tr></thead>
            <tbody>
              {uploads.sort((a, b) => a.label.localeCompare(b.label) || b.year - a.year).map((u) => (
                <tr key={u.key}>
                  <Td>{u.label}</Td>
                  <Td>{u.year}</Td>
                  <Td>{fmt(u.count)}</Td>
                  <Td className="text-xs text-ink-muted">{day(u.at)}</Td>
                  <Td><Button type="button" variant="ghost" disabled={busy} onClick={() => setRemoving(u.remove)}>Remove</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </details>

      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Remove ${labelOf(removing.k, removing.y, removing.name)}?` : ''}
        stayLabel="Keep it"
        confirmLabel="Remove"
        onConfirm={() => removing && void clear(removing.k, removing.y, removing.name)}
        onCancel={() => setRemoving(null)}
      >
        Papers then use the next newest year of this list, or show NA.
      </ConfirmDialog>
    </div>
  );
}

function SourceRow({
  name, full, gives, how, state, status, action,
}: {
  name: string; full?: string; gives: string; how: string;
  state: 'ok' | 'missing' | 'optional' | 'running'; status: string; action?: ReactNode;
}) {
  const look = {
    ok: { cls: 'text-success-700', Glyph: IconCheck },
    missing: { cls: 'text-danger-700', Glyph: IconAlert },
    optional: { cls: 'text-warning-700', Glyph: IconAlert },
    running: { cls: 'text-info-700', Glyph: IconClock },
  }[state];
  return (
    <tr>
      <Td>
        <span className="font-semibold">{name}</span>
        {full ? <span className="block text-xs text-ink-muted">{full}</span> : null}
      </Td>
      <Td className="text-xs">{gives}</Td>
      <Td className="text-xs text-ink-muted">{how}</Td>
      <Td className={cx('text-xs font-semibold', look.cls)}>
        <span className="inline-flex items-start gap-1"><look.Glyph width={13} height={13} className="mt-px shrink-0" />{status}</span>
      </Td>
      <Td className="whitespace-nowrap text-right">{action}</Td>
    </tr>
  );
}

function HowTo({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-ink">{title}</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5">{children}</ol>
    </div>
  );
}
