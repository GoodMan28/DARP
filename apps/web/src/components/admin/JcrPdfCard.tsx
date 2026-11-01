'use client';

import { useRef, useState } from 'react';
import { csrfHeader } from '@/lib/csrf-client';
import { Button, Card, CardHeader, Notice } from '@/components/ui';
import { IconUpload } from '@/components/shell/Icon';
import type { ApiResult } from '@darp/shared/contracts';

interface Report {
  jifYear: number; rows: number; journals: number; byWos: number; byOther: number; nameOnly: string[]; ambiguous: number; issns: number;
}

const fmt = (n: number) => n.toLocaleString('en-IN');

/**
 * The Journal Citation Reports list as the library prints it: a PDF with journal names and no ISSNs.
 * Uploading it replaces that year, so every paper's Impact Factor and JIF quartile change at once.
 */
export function JcrPdfCard({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setReport(null);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/admin/journal-lists/jcr-pdf', { method: 'POST', body: form, credentials: 'same-origin', headers: csrfHeader() })
      .then((r) => r.json() as Promise<ApiResult<Report>>).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) { setError(res && !res.ok ? res.error.message : 'The PDF could not be uploaded.'); return; }
    setReport(res.data);
    setFile(null);
    if (input.current) input.current.value = '';
    onDone();
  }

  return (
    <Card padded={false}>
      <CardHeader
        title="Journal Citation Reports (PDF)"
        subtitle="Upload the JCR list as a PDF. It replaces that year: every paper’s Impact Factor and quartile change at once."
      />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept=".pdf,application/pdf"
            aria-label="Journal Citation Reports PDF"
            disabled={busy}
            className="text-sm file:mr-3 file:rounded-sm file:border file:border-line file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); setReport(null); }}
          />
          <Button type="button" disabled={!file || busy} onClick={() => void upload()}>
            <IconUpload width={14} height={14} />
            {busy ? 'Reading the list…' : 'Upload'}
          </Button>
        </div>
        {busy ? <p className="text-xs text-ink-muted">A list of 600 pages takes a few seconds to read.</p> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {report ? (
          <Notice tone="success" title={`JIF ${report.jifYear} loaded`}>
            {fmt(report.journals)} journals read. {fmt(report.byWos + report.byOther)} were matched to ISSNs ({fmt(report.issns)} ISSNs),
            and {fmt(report.nameOnly.length)} by name only: a paper reaches those through its journal’s name.
            {report.ambiguous > 0 ? ` ${fmt(report.ambiguous)} share a name with several journals and were left to the name.` : ''}
            {report.nameOnly.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold">Journals found by name only</summary>
                <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5 text-xs">
                  {report.nameOnly.slice(0, 300).map((n) => <li key={n}>{n}</li>)}
                </ul>
                {report.nameOnly.length > 300 ? <p className="mt-1 text-xs">and {fmt(report.nameOnly.length - 300)} more.</p> : null}
              </details>
            ) : null}
          </Notice>
        ) : null}
      </div>
    </Card>
  );
}
