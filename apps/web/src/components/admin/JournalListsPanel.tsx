'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import {
  Button, Card, CardHeader, EmptyState, Field, Input, Notice, Select, Table, Td, Th,
} from '@/components/ui';
import {
  parseCsv, extractSjrRows, extractListRows, extractJcrRows, type JournalListRow,
} from '@darp/shared/journals';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { JournalListsPayload } from './types';

/** Rows per request: well under the API's 1 MB JSON cap. */
const BATCH = 4000;

type Kind = 'sjr' | 'list' | 'jcr';

/**
 * Where the indexing, quartile and Impact Factor shown on Publications come from. IQAC downloads
 * the yearly files and loads them here; the file is read in the browser and only the ISSN rows are
 * sent. Nothing is stored on the papers, so a list loaded here counts for every paper at once.
 */
export function JournalListsPanel() {
  const [data, setData] = useState<JournalListsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>('sjr');
  const [listName, setListName] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<{ k: Kind; y: number; name?: string } | null>(null);
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

  /** Several JCR exports (one per category, say) may be loaded together; each names its own year. */
  async function importJcr() {
    setBusy(true);
    setResult(null);
    const loaded: string[] = [];
    for (const f of files) {
      setProgress(`Reading ${f.name}…`);
      const extracted = extractJcrRows(parseCsv(await f.text()));
      if (!extracted.ok) {
        setBusy(false);
        setProgress(null);
        setResult({ tone: 'danger', text: `${f.name}: ${extracted.message}` });
        await load();
        return;
      }
      const rows = extracted.rows;
      for (let i = 0; i < rows.length; i += BATCH) {
        setProgress(`${f.name}: saving ${Math.min(i + BATCH, rows.length).toLocaleString('en-IN')} of ${rows.length.toLocaleString('en-IN')} ISSNs…`);
        const res = await apiJson('/api/admin/journal-lists', {
          method: 'POST',
          body: JSON.stringify({
            action: 'importJcr', jifYear: extracted.jifYear, rows: rows.slice(i, i + BATCH),
            last: i + BATCH >= rows.length, totalRows: rows.length, fileName: f.name,
          }),
        });
        if (!res.ok) {
          setBusy(false);
          setProgress(null);
          setResult({ tone: 'danger', text: `${f.name} stopped after ${i.toLocaleString('en-IN')} ISSNs: ${res.error.message}` });
          await load();
          return;
        }
      }
      loaded.push(`${extracted.journals.toLocaleString('en-IN')} journals with JIF ${extracted.jifYear} from ${f.name}`);
    }
    setBusy(false);
    setProgress(null);
    setFiles([]);
    setResult({ tone: 'success', text: `Loaded ${loaded.join('; ')}. Every paper in these journals now shows its Impact Factor.` });
    await load();
  }

  async function importFile() {
    if (kind === 'jcr') { await importJcr(); return; }
    const file = files[0];
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
    setFiles([]);
    setResult({
      tone: 'success',
      text: `Loaded ${extracted.journals.toLocaleString('en-IN')} journals (${rows.length.toLocaleString('en-IN')} ISSNs) as ${kind === 'sjr' ? `SJR ${y}` : `${listName} ${y}`}. Every paper now uses it.`,
    });
    await load();
  }

  async function refreshScopus() {
    setBusy(true);
    setResult(null);
    setProgress('Downloading the Scopus list from Elsevier (about 25 MB)…');
    const res = await apiJson<NonNullable<JournalListsPayload['scopus']>>('/api/admin/journal-lists', {
      method: 'POST', body: JSON.stringify({ action: 'syncScopus' }),
    });
    setBusy(false);
    setProgress(null);
    setResult(res.ok
      ? { tone: 'success', text: `Fetched ${res.data.file}: ${res.data.indexed.toLocaleString('en-IN')} journals indexed in Scopus, ${res.data.ranked.toLocaleString('en-IN')} with a quartile.` }
      : { tone: 'danger', text: res.error.message });
    await load();
  }

  async function refreshPatents() {
    setBusy(true);
    setResult(null);
    const res = await apiJson<JournalListsPayload['patents']>('/api/admin/journal-lists', {
      method: 'POST', body: JSON.stringify({ action: 'syncPatents' }),
    });
    setBusy(false);
    setResult(res.ok
      ? { tone: 'success', text: 'Reading new Patent Office Journal issues in the background. Reload this page to see the progress.' }
      : { tone: 'danger', text: res.error.message });
    await load();
  }

  const labelOf = (k: Kind, y: number, name?: string) => (k === 'sjr' ? `SJR ${y}` : k === 'jcr' ? `JIF ${y}` : `${name} ${y}`);

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

  if (loadError) return <Notice tone="danger" title="Journal lists could not be loaded">{loadError}</Notice>;
  if (!data) return <p className="text-sm text-ink-muted">Loading journal lists…</p>;

  const nothingLoaded = data.sjr.length === 0 && data.lists.length === 0 && data.jcr.length === 0;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];

  return (
    <div className="space-y-4">
      <Card padded={false}>
        <CardHeader
          title="Automatic: Scopus list from Elsevier"
          subtitle="Fetched by the server from Elsevier's public Scopus source list — no download needed. Checked for a newer list every night at 2 AM."
          actions={<Button type="button" variant="secondary" disabled={busy} onClick={() => void refreshScopus()}>Refresh now</Button>}
        />
        <div className="p-4 text-sm">
          {data.scopus ? (
            <p>
              Using the <strong>{months[data.scopus.listMonth - 1]} {data.scopus.listYear}</strong> list
              ({data.scopus.file}), fetched {new Date(data.scopus.fetchedAt).toLocaleDateString('en-IN')}:{' '}
              {data.scopus.indexed.toLocaleString('en-IN')} journals indexed in Scopus,{' '}
              {data.scopus.ranked.toLocaleString('en-IN')} with a quartile from their SJR {data.scopus.sjrYear} value
              {data.scopus.discontinued
                ? `, and ${data.scopus.discontinued.toLocaleString('en-IN')} titles Scopus has dropped`
                : ''}.
              {data.scopus.checkedAt ? (
                <> Last checked for a newer list {new Date(data.scopus.checkedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.</>
              ) : null}
            </p>
          ) : (
            <p className="text-ink-muted">Not fetched yet. It is fetched when the API starts; press “Refresh now” to fetch it now.</p>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Indexing “Scopus” is given only when Scopus covered the journal in the paper’s year — a journal Scopus
            dropped after 2023 does not index a 2024 paper. The quartile shown is always from the newest SJR year, and applies SCImago’s method to the SJR values
            in Elsevier’s list (rank within each subject category, best quartile). Elsevier’s list has SJR values only
            for journals still in Scopus, so this quartile is an estimate and is labelled “estimated”. Loading SCImago’s
            own file for each year below (SCImago blocks automatic downloads) replaces it with SCImago’s official
            figures for that year. Web of Science (SCIE, SSCI, …) and its Impact Factors cannot be fetched
            automatically either — Clarivate requires a login — so load those below.
          </p>
        </div>
      </Card>

      <Card padded={false}>
        <CardHeader
          title="Automatic: Patent Office Journal (IP India)"
          subtitle="Patents → Fetch details looks the number up here. The server reads each weekly issue of the Official Journal once; new issues every night at 3 AM."
          actions={(
            <Button type="button" variant="secondary" disabled={busy || data.patents.running} onClick={() => void refreshPatents()}>
              {data.patents.running ? 'Reading…' : 'Read new issues now'}
            </Button>
          )}
        />
        <div className="p-4 text-sm">
          {data.patents.newestIssue && data.patents.oldestIssue ? (
            <p>
              Read <strong>{data.patents.partsIndexed.toLocaleString('en-IN')}</strong>
              {data.patents.partsListed ? ` of ${data.patents.partsListed.toLocaleString('en-IN')}` : ''} journal parts,
              issues {data.patents.oldestIssue.issue} ({new Date(data.patents.oldestIssue.date).toLocaleDateString('en-IN')})
              to {data.patents.newestIssue.issue} ({new Date(data.patents.newestIssue.date).toLocaleDateString('en-IN')}):{' '}
              {data.patents.applications.toLocaleString('en-IN')} published applications and{' '}
              {data.patents.grants.toLocaleString('en-IN')} granted patents.
              {data.patents.partsFailed ? ` ${data.patents.partsFailed} parts could not be read and will be tried again tonight.` : ''}
            </p>
          ) : (
            <p className="text-ink-muted">
              {data.patents.running
                ? 'Reading the journal now. The first time it reads every issue since January ' + data.patents.fromYear + ', which takes some hours; patents can be entered by hand meanwhile.'
                : 'Not read yet. It is read when the API starts; press “Read new issues now” to start.'}
            </p>
          )}
          {data.patents.checkedAt ? (
            <p className="mt-1 text-xs text-ink-muted">
              Last looked for new issues {new Date(data.patents.checkedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.
              {data.patents.lastError ? ` That check failed: ${data.patents.lastError}` : ''}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-ink-muted">
            IP India offers no API, and its patent search is behind a CAPTCHA, which the portal never automates. The
            weekly Official Journal is the statutory publication of every application and grant, as plain PDFs. A patent
            whose application and grant were both published before {data.patents.fromYear}, or one filed outside India,
            is entered by hand.
          </p>
        </div>
      </Card>

      {nothingLoaded ? (
        <Notice tone="warning" title="No journal list is loaded yet">
          Until one is, Publications show NA for the indexing, quartile and Impact Factor. Press “Refresh now” above.
        </Notice>
      ) : null}

      <Card padded={false}>
        <CardHeader
          title="Load a journal list"
          subtitle="Web of Science collections, Impact Factors, or SCImago's own quartiles. The file is read on this computer; only the ISSNs are sent."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="List" htmlFor="jl-kind">
            <Select id="jl-kind" value={kind} disabled={busy} onChange={(e) => setKind(e.target.value as Kind)}>
              <option value="list">An indexing list (Web of Science collection: SCIE, SSCI, AHCI, ESCI)</option>
              <option value="jcr">Journal Citation Reports export (Impact Factor and JIF quartile)</option>
              <option value="sjr">SCImago Journal Rank (quartile, and Scopus coverage)</option>
            </Select>
          </Field>
          {kind === 'list' ? (
            <Field label="Index" htmlFor="jl-name" help="Values come from the Indexing master list.">
              <Select id="jl-name" value={listName} disabled={busy} onChange={(e) => setListName(e.target.value)}>
                {data.listNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
          ) : null}
          {kind !== 'jcr' ? (
            <Field
              label="Year"
              htmlFor="jl-year"
              help={kind === 'sjr' ? 'The SJR edition year chosen on the SCImago site.' : 'The year you downloaded the list.'}
            >
              <Input id="jl-year" inputMode="numeric" maxLength={4} value={year} disabled={busy}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} />
            </Field>
          ) : null}
          <Field
            label={kind === 'jcr' ? 'CSV files' : 'CSV file'}
            htmlFor="jl-file"
            help={kind === 'jcr' ? 'One or more exports. The JIF year is read from each file ("2024 JIF").' : undefined}
          >
            <input
              id="jl-file"
              type="file"
              accept=".csv,text/csv"
              multiple={kind === 'jcr'}
              disabled={busy}
              onChange={(e) => setFiles([...(e.target.files ?? [])])}
              className="block w-full text-sm"
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <Button type="button" disabled={busy || files.length === 0 || (kind === 'list' && !listName)} onClick={() => void importFile()}>
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
          <p className="mt-1">
            <strong>Impact Factor:</strong> the library signs in to Journal Citation Reports with BIT’s subscription,
            chooses the latest year and all editions, and exports CSV (several exports, one per category, are fine).
            A journal not in the file shows NA. Clarivate does not allow automated downloading, so this is done by hand
            once a year, after JCR is released in June.
          </p>
        </div>
      </Card>

      <Card padded={false}>
        <CardHeader title="Loaded lists" subtitle="Every paper uses the newest year of each list. Scopus also needs the journal to have been covered in the paper's own year." />
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
                <tr key={`sjr-${s.year}-${s.source}`}>
                  <Td>{s.source === 'scopus-list' ? 'SJR from the Scopus list (automatic)' : 'SCImago SJR'}</Td>
                  <Td>{s.year}</Td>
                  <Td>{s.issns.toLocaleString('en-IN')}</Td>
                  <Td className="text-xs text-ink-muted">{s.ranked.toLocaleString('en-IN')} with a quartile</Td>
                  <Td>
                    {s.source === 'scopus-list'
                      ? <span className="text-xs text-ink-muted">Refreshed automatically</span>
                      : <Button type="button" variant="ghost" disabled={busy} onClick={() => setRemoving({ k: 'sjr', y: s.year })}>Remove</Button>}
                  </Td>
                </tr>
              ))}
              {data.jcr.map((j) => (
                <tr key={`jcr-${j.jifYear}`}>
                  <Td>Journal Citation Reports (Impact Factor)</Td>
                  <Td>{j.jifYear}</Td>
                  <Td>{j.issns.toLocaleString('en-IN')}</Td>
                  <Td className="text-xs text-ink-muted">{j.withJif.toLocaleString('en-IN')} with an Impact Factor</Td>
                  <Td>
                    <Button type="button" variant="ghost" disabled={busy} onClick={() => setRemoving({ k: 'jcr', y: j.jifYear })}>Remove</Button>
                  </Td>
                </tr>
              ))}
              {data.lists.map((l) => (
                <tr key={`${l.listName}-${l.year}-${l.source}`}>
                  <Td>{l.listName}{l.source === 'scopus-list' ? ' (automatic)' : ''}</Td>
                  <Td>{l.year}</Td>
                  <Td>{l.issns.toLocaleString('en-IN')}</Td>
                  <Td className="text-xs text-ink-muted">Indexing list</Td>
                  <Td>
                    {l.source === 'scopus-list'
                      ? <span className="text-xs text-ink-muted">Refreshed automatically</span>
                      : <Button type="button" variant="ghost" disabled={busy} onClick={() => setRemoving({ k: 'list', y: l.year, name: l.listName })}>Remove</Button>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Remove ${labelOf(removing.k, removing.y, removing.name)}?` : ''}
        stayLabel="Keep it"
        confirmLabel="Remove"
        onConfirm={() => removing && void clear(removing.k, removing.y, removing.name)}
        onCancel={() => setRemoving(null)}
      >
        Papers then show the next newest list, or NA.
      </ConfirmDialog>
    </div>
  );
}
