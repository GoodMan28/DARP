'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { apiJson, csrfHeader } from '@/lib/csrf-client';
import {
  Button, Card, CardHeader, Checkbox, FileInput, Notice, StatePill, Table, Th, Td,
} from '@/components/ui';
import { IconUpload } from '@/components/shell/Icon';
import type { BulkImport, BulkItem, BulkItemStatus, BulkSubmitResult } from '@darp/shared/contracts';
import type { LookupKind } from '@darp/shared/modules/types';

/** What happened to a line of the file, in a few words; `many` is the summary over the table. */
const OUTCOME: Record<BulkItemStatus, { label: string; many: string; cls: string }> = {
  pending: { label: 'Waiting…', many: 'still to check', cls: 'text-ink-muted' },
  created: { label: 'Draft made', many: 'drafts made', cls: 'text-success-700' },
  exists: { label: 'Already added', many: 'already added', cls: 'text-ink-muted' },
  'not-found': { label: 'Not found', many: 'not found', cls: 'text-warning-700' },
  'wrong-module': { label: 'Belongs in another module', many: 'belong in another module', cls: 'text-warning-700' },
  'not-yours': { label: 'Your name is not on it', many: 'without your name', cls: 'text-warning-700' },
  error: { label: 'Could not be checked', many: 'could not be checked', cls: 'text-danger-700' },
};

const SAMPLE: Record<LookupKind, string> = {
  doi: 'DOI\n10.1016/j.future.2026.107812\nhttps://doi.org/10.1109/TKDE.2011.163\n',
  book: 'DOI or ISBN\n10.1007/978-981-99-1234-5_12\n978-93-5578-123-4\n',
  patent: 'Patent number\n202331060280\n599883\n935/KOL/2013\n',
};

interface Recent { id: string; fileName: string; status: string; total: number; done: number; createdAt: string }

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function BulkUpload({
  moduleKey, moduleName, kind, what, initialId,
}: { moduleKey: string; moduleName: string; kind: LookupKind; what: string; initialId: string | null }) {
  const inputId = useId();
  const [importId, setImportId] = useState<string | null>(initialId);
  const [data, setData] = useState<BulkImport | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, BulkSubmitResult>>({});
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const base = `/api/modules/${moduleKey}/bulk`;

  const load = useCallback(async (id: string) => {
    const res = await apiJson<BulkImport>(`${base}/${id}`);
    if (!res.ok) { setError(res.error.message); setImportId(null); return null; }
    setData(res.data);
    return res.data;
  }, [base]);

  // Step 2: poll every 2 seconds until every line has been checked.
  useEffect(() => {
    if (!importId) return undefined;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const d = await load(importId);
      if (!stop && d?.status === 'running') timer = setTimeout(() => void tick(), 2000);
    };
    void tick();
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [importId, load]);

  useEffect(() => {
    if (importId) return;
    void apiJson<Recent[]>(base).then((r) => { if (r.ok) setRecent(r.data); });
  }, [importId, base]);

  /** Keeps the upload in the address, so a refresh reopens it. */
  function show(id: string | null) {
    setImportId(id);
    setData(null);
    setChosen(new Set());
    setResults({});
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
    window.history.replaceState(null, '', url);
  }

  async function upload(file: File) {
    setError(null);
    if (file.size > 1024 * 1024) { setError('The file must be 1 MB or smaller.'); return; }
    if (!/\.(txt|csv|xlsx)$/i.test(file.name)) { setError('Upload a .txt, .csv or .xlsx file.'); return; }
    setBusy(true);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(base, { method: 'POST', body: form, credentials: 'same-origin', headers: csrfHeader() })
      .then((r) => r.json()).catch(() => null) as { ok: boolean; data?: { id: string }; error?: { message: string } } | null;
    setBusy(false);
    if (!res?.ok || !res.data) { setError(res?.error?.message ?? 'The file could not be uploaded.'); return; }
    show(res.data.id);
  }

  async function attach(recordId: string, fileId: string) {
    const res = await apiJson(`${base}/${importId}/evidence`, { method: 'POST', body: JSON.stringify({ recordId, fileId }) });
    if (!res.ok) setResults((r) => ({ ...r, [recordId]: { recordId, ok: false, status: null, message: res.error.message } }));
    else {
      setChosen((c) => new Set(c).add(recordId));
      await load(importId!);
    }
  }

  async function submit() {
    setSubmitting(true);
    const res = await apiJson<BulkSubmitResult[]>(`${base}/${importId}/submit`, {
      method: 'POST', body: JSON.stringify({ recordIds: [...chosen] }),
    });
    setSubmitting(false);
    if (!res.ok) { setError(res.error.message); return; }
    setResults(Object.fromEntries(res.data.map((r) => [r.recordId, r])));
    setChosen(new Set());
    await load(importId!);
  }

  /* ── Step 1: the file ───────────────────────────────────────── */
  if (!importId) {
    const sample = `data:text/plain;charset=utf-8,${encodeURIComponent(SAMPLE[kind])}`;
    return (
      <div className="grid gap-4">
        <Card padded={false}>
          <CardHeader title="Step 1: choose your file" subtitle={`One ${kind === 'patent' ? 'number' : 'identifier'} per line, or a CSV or Excel file with ${what} in any column. Up to 100.`} />
          <div className="p-4">
            <label
              htmlFor={inputId}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-sm border-2 border-dashed px-4 py-10 text-center ${dragging ? 'border-primary bg-primary/5' : 'border-line-strong bg-surface-2'}`}
            >
              <IconUpload width={22} height={22} />
              <span className="text-sm font-semibold">{busy ? 'Reading the file…' : 'Drop the file here, or click to choose it'}</span>
              <span className="text-xs text-ink-muted">.txt, .csv or .xlsx, up to 1 MB. Other text in the file (titles, headings) is ignored.</span>
            </label>
            <input
              id={inputId}
              type="file"
              accept=".txt,.csv,.xlsx"
              className="sr-only"
              disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }}
            />
            {error ? <Notice tone="danger" className="mt-3">{error}</Notice> : null}
            <p className="mt-3 text-xs text-ink-muted">
              <a href={sample} download={`sample-${moduleKey}.txt`} className="font-semibold text-primary underline">Download a sample file</a>
              {' '}to see the layout.
            </p>
          </div>
        </Card>
        <Card padded={false}>
          <CardHeader title="What happens next" />
          <ol className="list-decimal space-y-1 py-3 pl-9 pr-4 text-sm">
            <li>DARP fetches each one from {kind === 'patent' ? 'the Patent Office Journal' : 'the publisher registers'}, about one a second.</li>
            <li>Each one becomes a <strong>draft</strong>, filled in and locked as if you had pressed “Fetch details”. One that was not found, or does not show your name, is a draft too, with a note saying what to add. Only those you have already added are skipped.</li>
            <li>Click a title to open the draft and complete it; <strong>Save and return to the upload</strong> brings you back here.</li>
            <li>Attach the evidence on each row, tick the ones you want to add, and press <strong>Submit selected</strong>. Drafts you leave stay in your {moduleName} list.</li>
          </ol>
        </Card>
        {recent.length > 0 ? (
          <Card padded={false}>
            <CardHeader title="Your last uploads" />
            <ul className="divide-y divide-line text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                  <button type="button" className="font-semibold text-primary underline" onClick={() => show(r.id)}>{r.fileName}</button>
                  <span className="text-xs text-ink-muted">{when(r.createdAt)} · {r.total} in the file{r.status === 'running' ? ` · ${r.done} checked so far` : ''}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    );
  }

  if (!data) return <p className="text-sm text-ink-muted">Loading…</p>;

  /* ── Step 2 and 3: progress, then the review table ──────────── */
  const running = data.status === 'running';
  const counts = data.items.reduce<Partial<Record<BulkItemStatus, number>>>((c, i) => ({ ...c, [i.status]: (c[i.status] ?? 0) + 1 }), {});
  // Every draft the upload made can be submitted, whatever the check found: the faculty member is trusted.
  const submittable = (i: BulkItem) => !!i.record && i.record.mine && i.record.status === 'draft' && i.status !== 'exists';
  const ready = data.items.filter(submittable);
  const allChosen = ready.length > 0 && ready.every((i) => chosen.has(i.record!.id));

  return (
    <div className="grid gap-4">
      <Card padded={false}>
        <CardHeader
          title={running ? `Checking ${data.fileName}…` : `${data.fileName}`}
          subtitle={running
            ? `${data.done} of ${data.total} checked. You can leave this page; the work carries on.`
            : `Checked ${data.total} on ${when(data.createdAt)}.`}
          actions={<Button variant="secondary" onClick={() => show(null)}>Upload another file</Button>}
        />
        <div className="px-4 py-3">
          <div className="h-2 overflow-hidden rounded-full bg-surface-inset" role="progressbar" aria-valuemin={0} aria-valuemax={data.total} aria-valuenow={data.done}>
            <div className="h-full bg-primary transition-all" style={{ width: `${data.total ? (100 * data.done) / data.total : 0}%` }} />
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {(Object.keys(OUTCOME) as BulkItemStatus[]).filter((s) => counts[s]).map((s) => (
              <span key={s} className={OUTCOME[s].cls}><strong>{counts[s]}</strong> {counts[s] === 1 ? OUTCOME[s].label.toLowerCase() : OUTCOME[s].many}</span>
            ))}
          </p>
          {data.status === 'failed' ? (
            <Notice tone="warning" className="mt-3">The upload stopped before the end. The lines not reached say so; upload them again in a new file.</Notice>
          ) : null}
          {error ? <Notice tone="danger" className="mt-3">{error}</Notice> : null}
        </div>
      </Card>

      <Card padded={false}>
        <CardHeader
          title={running ? 'Review (filling in as they are checked)' : 'Step 2: attach evidence and submit'}
          subtitle="Tick the drafts that are ready. A draft that still needs something is refused on its own row; the others go through."
          actions={(
            <Button disabled={chosen.size === 0 || submitting} onClick={() => void submit()}>
              {submitting ? 'Submitting…' : `Submit selected (${chosen.size})`}
            </Button>
          )}
        />
        <Table>
          <thead>
            <tr>
              <Th className="w-10">
                <Checkbox
                  aria-label="Choose every draft"
                  checked={allChosen}
                  disabled={ready.length === 0}
                  onChange={(e) => setChosen(e.target.checked ? new Set(ready.map((i) => i.record!.id)) : new Set())}
                />
              </Th>
              <Th className="w-56">{kind === 'patent' ? 'Number' : 'Identifier'}</Th>
              <Th>What happened</Th>
              <Th className="w-64">Evidence</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((i) => (
              <Row
                key={i.id}
                item={i}
                moduleKey={moduleKey}
                importId={data.id}
                chosen={!!i.record && chosen.has(i.record.id)}
                submittable={submittable(i)}
                result={i.record ? results[i.record.id] : undefined}
                onChoose={(on) => setChosen((c) => { const n = new Set(c); if (on) n.add(i.record!.id); else n.delete(i.record!.id); return n; })}
                onAttach={(fileId) => void attach(i.record!.id, fileId)}
              />
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function Row({
  item, moduleKey, importId, chosen, submittable, result, onChoose, onAttach,
}: {
  item: BulkItem; moduleKey: string; importId: string; chosen: boolean; submittable: boolean;
  result?: BulkSubmitResult; onChoose: (on: boolean) => void; onAttach: (fileId: string) => void;
}) {
  const r = item.record;
  const outcome = OUTCOME[item.status];
  const evidence = r?.evidence ?? null;
  // The record's own page, with a way back here ("Save and return to the upload").
  const open = (id: string, inModule: string) => `/m/${inModule}/${id}?bulk=${importId}&from=${moduleKey}`;
  return (
    <tr className="align-top">
      <Td>
        {submittable ? <Checkbox aria-label={`Choose ${item.raw}`} checked={chosen} onChange={(e) => onChoose(e.target.checked)} /> : null}
      </Td>
      <Td className="break-all font-mono text-xs">{item.raw}</Td>
      <Td>
        {/* Once submitted, the record's own status says what it is now. */}
        {item.status !== 'exists' && r && r.status !== 'draft'
          ? <StatePill status={r.status} />
          : <p className={`text-xs font-semibold ${outcome.cls}`}>{outcome.label}</p>}
        {r ? (
          <a href={open(r.id, r.moduleKey)} className="mt-0.5 block font-semibold text-primary underline-offset-2 hover:underline">
            {r.title || (r.status === 'draft' ? 'Open the draft to fill it in' : 'Open the record')}
          </a>
        ) : null}
        {item.message ? <p className="mt-0.5 text-xs text-ink-muted">{item.message}</p> : null}
        {r && r.status === 'draft' && r.points.length > 0 ? (
          <ul className="mt-1 list-disc pl-4 text-xs text-warning-700">
            {r.points.slice(0, 3).map((p) => <li key={p}>{p}</li>)}
          </ul>
        ) : null}
        {result ? (
          <p role="status" className={`mt-1 text-xs font-semibold ${result.ok ? 'text-success-700' : 'text-danger-700'}`}>
            {result.ok ? 'Submitted and approved.' : `Not submitted: ${result.message}`}
            {!result.ok && r ? <> <a href={open(r.id, r.moduleKey)} className="underline">Open it to finish</a></> : null}
          </p>
        ) : null}
      </Td>
      <Td>
        {r && r.mine && r.status === 'draft' && evidence ? (
          <>
            <FileInput
              fieldKey={evidence.fieldKey}
              moduleKey={r.moduleKey}
              recordId={r.id}
              accept={evidence.accept}
              maxSizeMB={evidence.maxSizeMB}
              value={r.evidenceId ?? undefined}
              onUploaded={onAttach}
            />
            {r.evidenceId ? <p className="mt-1 text-xs text-success-700">Evidence attached.</p>
              : r.needsEvidence ? <p className="mt-1 text-xs text-warning-700">Needed before it can be submitted.</p> : null}
          </>
        ) : null}
      </Td>
    </tr>
  );
}
