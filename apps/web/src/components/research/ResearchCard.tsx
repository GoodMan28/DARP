'use client';

import { useId, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Button, Card, CardHeader, FileInput, Input, Notice, Table, Td, Th } from '@/components/ui';
import { formatDate } from '@darp/shared/format';
import { QUALITY_LABEL, type MetricsRow, type ResearchProfile } from '@darp/shared/research';

const n = (v: number | null | undefined) => (v === null || v === undefined ? 'NA' : v.toLocaleString('en-IN'));
const pct = (v: number | null) => (v === null ? 'NA' : `${v}%`);

/**
 * A researcher's figures from Scopus, Web of Science and OpenAlex, side by side. The Scopus Author ID
 * and ResearcherID are read from the person's ORCID record ("Other IDs"); OpenAlex is found by the
 * ORCID iD itself. An ID can still be typed when it is not on ORCID.
 */
export function ResearchCard({ initial }: { initial: ResearchProfile }) {
  const id = useId();
  const [p, setP] = useState(initial);
  const [scopusId, setScopusId] = useState(initial.scopusAuthorId ?? '');
  const [rid, setRid] = useState(initial.researcherId ?? '');
  const [wos, setWos] = useState({
    documents: String(initial.wos?.typed ? initial.wos.documents ?? '' : ''),
    citationsExclSelf: String(initial.wos?.typed ? initial.wos.citationsExclSelf ?? '' : ''),
    hIndex: String(initial.wos?.typed ? initial.wos.hIndex ?? '' : ''),
    asOf: new Date().toISOString().slice(0, 10),
    evidenceId: initial.wos?.typed ? initial.wos.evidenceId ?? '' : '',
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  async function call(what: string, url: string, method: string, body?: unknown) {
    setBusy(what);
    setError({});
    setSaved(null);
    const res = await apiJson<ResearchProfile>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    setBusy(null);
    if (!res.ok) { setError({ ...(res.error.fields ?? {}), [what]: res.error.fields ? '' : res.error.message }); return; }
    setP(res.data);
    setScopusId(res.data.scopusAuthorId ?? '');
    setRid(res.data.researcherId ?? '');
    setSaved(what);
  }

  const c = p.scopusCheck;
  const s = p.signal;
  /** A column's state when it has no figures: why not. */
  const missing = (source: 'scopus' | 'wos' | 'openalex'): string => {
    if (source === 'openalex') return p.orcid ? (p.orcidTrusted ? 'Not found on OpenAlex yet' : 'Your ORCID iD is not confirmed') : 'Add your ORCID iD';
    if (source === 'scopus') {
      if (!p.scopusAuthorId) return 'No Scopus Author ID';
      if (!p.scopusConnected) return 'Not connected yet (Elsevier key)';
      if (c && !c.nameMatches && !c.unchecked) {
        return c.nameShare !== undefined ? 'The papers of this ID do not carry your name' : `This ID belongs to ${c.scopusName || 'someone else'}`;
      }
      return 'Not fetched yet';
    }
    if (!p.researcherId) return 'No ResearcherID';
    if (!p.wosConnected) return 'Type them below';
    if (c?.wos && !c.wos.nameMatches && !c.wos.unchecked) return `This ID belongs to ${c.wos.wosName || 'someone else'}`;
    return 'Not fetched yet';
  };
  const cols: Array<[string, 'scopus' | 'wos' | 'openalex', MetricsRow | null]> = [
    ['Scopus', 'scopus', p.scopus], ['Web of Science', 'wos', p.wos], ['OpenAlex', 'openalex', p.openalex],
  ];

  return (
    <Card className="mb-4" padded={false}>
      <CardHeader
        title="Research IDs and figures"
        subtitle="Your publications, citations and h-index in Scopus, Web of Science and OpenAlex, side by side."
      />

      {/* Where the IDs come from */}
      <div className="border-b border-line p-4 text-sm">
        {!p.orcid ? (
          <Notice tone="info">
            Add your <strong>ORCID iD</strong> under Account above. DARP then reads your Scopus Author ID and ResearcherID from
            your ORCID record (“Other IDs” on orcid.org) and fetches your figures. Nothing else to type.
          </Notice>
        ) : !p.orcidTrusted ? (
          <Notice tone="warning">
            Your ORCID iD is saved, but its record is not under your account’s name, so DARP does not read IDs or figures from it.
          </Notice>
        ) : (
          <p className="text-ink-muted">IDs read from your ORCID record <span className="font-mono">{p.orcid}</span>. To change them, change them on orcid.org and press “Fetch now”.</p>
        )}
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {([
            ['scopus', 'Scopus Author ID', scopusId, setScopusId, p.idsFromOrcid.scopusAuthorId, '57200000001', error.scopusAuthorId],
            ['rid', 'Web of Science ResearcherID', rid, setRid, p.idsFromOrcid.researcherId, 'AAB-1234-2020', error.researcherId],
          ] as const).map(([k, label, value, set, fromOrcid, ph, err]) => (
            <div key={k}>
              <label htmlFor={`${id}-${k}`} className="mb-1 block text-xs font-semibold text-ink-muted">{label}</label>
              {fromOrcid ? (
                <p id={`${id}-${k}`} className="font-mono text-sm">{value} <span className="font-sans text-xs text-success-700">from your ORCID record</span></p>
              ) : (
                <>
                  <Input id={`${id}-${k}`} className="font-mono" placeholder={ph} value={value} onChange={(e) => set(e.target.value)} />
                  <p className="mt-1 text-xs text-ink-muted">Not on your ORCID record: type it, or better, add it to ORCID under “Other IDs”.</p>
                </>
              )}
              {err ? <p className="mt-1 text-xs text-danger-700">{err}</p> : null}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!(p.idsFromOrcid.scopusAuthorId && p.idsFromOrcid.researcherId) ? (
            <Button
              variant="secondary"
              disabled={busy !== null || (scopusId.trim() === (p.scopusAuthorId ?? '') && rid.trim().toUpperCase() === (p.researcherId ?? ''))}
              onClick={() => void call('ids', '/api/profile/research/ids', 'PUT', {
                ...(p.idsFromOrcid.scopusAuthorId ? {} : { scopusAuthorId: scopusId || null }),
                ...(p.idsFromOrcid.researcherId ? {} : { researcherId: rid || null }),
              })}
            >
              {busy === 'ids' ? 'Saving…' : 'Save typed IDs'}
            </Button>
          ) : null}
          {p.orcidTrusted || p.scopusAuthorId || p.researcherId ? (
            <Button variant="ghost" disabled={busy !== null} onClick={() => void call('refresh', '/api/profile/research/refresh', 'POST', {})}>
              {busy === 'refresh' ? 'Fetching…' : 'Fetch now'}
            </Button>
          ) : null}
          {p.scopusAuthorId ? (
            <a className="text-xs underline" target="_blank" rel="noreferrer"
              href={`https://www.scopus.com/authid/detail.uri?authorId=${encodeURIComponent(p.scopusAuthorId)}`}>
              Open my Scopus author page
            </a>
          ) : null}
          {saved ? <span className="text-xs text-success-700">{saved === 'refresh' ? 'Fetched.' : 'Saved.'}</span> : null}
          {error.ids || error.refresh ? <Notice tone="danger" className="w-full">{error.ids || error.refresh}</Notice> : null}
        </div>
      </div>

      {/* The comparison */}
      <Table>
        <thead>
          <tr>
            <Th>Figure</Th>
            {cols.map(([label, key, row]) => (
              <Th key={key} className="text-right">
                {label}
                <span className="block text-2xs font-normal text-ink-faint">
                  {row ? `${row.source === 'wos' && p.wos?.typed ? 'typed' : 'fetched'} ${formatDate(row.asOf)}` : missing(key)}
                </span>
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {([
            ['Publications (documents)', (r: MetricsRow) => r.documents],
            ['Citations', (r: MetricsRow) => r.citations],
            ['Citations without self-citations', (r: MetricsRow) => r.citationsExclSelf],
            ['h-index', (r: MetricsRow) => r.hIndex],
            ['h-index without self-citations', (r: MetricsRow) => r.hIndexExclSelf],
          ] as const).map(([label, get]) => (
            <tr key={label}>
              <Td className="text-xs font-semibold">{label}</Td>
              {cols.map(([, key, row]) => (
                <Td key={key} className="text-right font-mono tabular-nums">{row ? n(get(row)) : '—'}</Td>
              ))}
            </tr>
          ))}
          {p.scopus ? (
            <tr>
              <Td className="text-xs font-semibold">Of the Scopus documents, written at BIT</Td>
              <Td className="text-right font-mono tabular-nums">{n(p.scopusBitDocuments)}</Td>
              <Td className="text-right font-mono tabular-nums">—</Td>
              <Td className="text-right font-mono tabular-nums">—</Td>
            </tr>
          ) : null}
        </tbody>
      </Table>
      <p className="border-b border-line px-4 py-2 text-2xs text-ink-muted">
        OpenAlex counts more kinds of sources than Scopus or Web of Science, so its numbers are usually higher. NA: the source does
        not give that figure{c?.noCitationOverview ? ' (Scopus figures without self-citations need Elsevier’s Citation Overview, not enabled for BIT yet)' : ''}.
        Refreshed automatically each month.
      </p>

      {/* Typed WoS figures, while Clarivate is not connected */}
      {!p.wosConnected ? (
        <details className="border-b border-line">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Type your Web of Science figures</summary>
          <div className="px-4 pb-4">
            <p className="text-xs text-ink-muted">
              Until BIT connects Clarivate’s Web of Science API, type the figures from your Web of Science researcher profile
              and attach a screenshot of them. IQAC can see the screenshot.
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-4">
              {([
                ['documents', 'Documents'],
                ['citationsExclSelf', 'Times cited without self-citations'],
                ['hIndex', 'h-index'],
              ] as const).map(([k, label]) => (
                <div key={k}>
                  <label htmlFor={`${id}-${k}`} className="mb-1 block text-xs font-semibold text-ink-muted">{label}</label>
                  <Input id={`${id}-${k}`} inputMode="numeric" value={wos[k]} onChange={(e) => setWos((w) => ({ ...w, [k]: e.target.value.replace(/\D/g, '') }))} />
                </div>
              ))}
              <div>
                <label htmlFor={`${id}-asof`} className="mb-1 block text-xs font-semibold text-ink-muted">As on</label>
                <Input id={`${id}-asof`} type="date" value={wos.asOf} onChange={(e) => setWos((w) => ({ ...w, asOf: e.target.value }))} />
              </div>
            </div>
            <div className="mt-3">
              <span className="mb-1 block text-xs font-semibold text-ink-muted">Screenshot of your Web of Science metrics</span>
              <FileInput fieldKey="wosEvidence" moduleKey="" accept={['png', 'jpg', 'jpeg', 'pdf']} maxSizeMB={2}
                value={wos.evidenceId || undefined} onUploaded={(fileId) => setWos((w) => ({ ...w, evidenceId: fileId }))} />
              {error.evidenceId ? <p className="mt-1 text-xs text-danger-700">{error.evidenceId}</p> : null}
              {error.asOf ? <p className="mt-1 text-xs text-danger-700">{error.asOf}</p> : null}
            </div>
            <div className="mt-3">
              <Button
                variant="secondary"
                disabled={busy !== null || !wos.documents || !wos.citationsExclSelf || !wos.hIndex || !wos.evidenceId}
                onClick={() => void call('wos', '/api/profile/research/wos', 'POST', {
                  documents: Number(wos.documents), citationsExclSelf: Number(wos.citationsExclSelf), hIndex: Number(wos.hIndex),
                  asOf: wos.asOf, evidenceId: wos.evidenceId,
                })}
              >
                {busy === 'wos' ? 'Saving…' : 'Save Web of Science figures'}
              </Button>
              {error.wos ? <Notice tone="danger" className="mt-2">{error.wos}</Notice> : null}
            </div>
          </div>
        </details>
      ) : null}

      {/* the signal */}
      <div className="p-4">
        <h3 className="text-sm font-semibold">
          Research profile: <span className="text-primary">{QUALITY_LABEL[s.label]}</span>
        </h3>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['WoS share of Scopus', pct(s.wosShare)],
            [s.citationsInclSelf ? 'Citations per paper (with self-citations)' : 'Citations per paper', n(s.citationsPerPaper)],
            ['h-index (Scopus · WoS)', `${n(s.scopusHIndex)} · ${n(s.wosHIndex)}`],
            [`Q1+Q2 papers ${p.range.from}–${p.range.to}`, s.papers ? `${s.topPapers} of ${s.papers} (${pct(s.topShare)})` : 'NA'],
          ].map(([k, v]) => (
            <div key={k}><dt className="text-2xs font-semibold text-ink-muted">{k}</dt><dd className="font-mono text-sm tabular-nums">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ink-muted">
          Citation habits differ by subject; compare within a department. Quality-leaning: at least {p.thresholds.qualityWosShare}% of
          papers in Web of Science and {p.thresholds.qualityTopShare}% in Q1/Q2 journals. Volume-leaning: {p.thresholds.volumeDocuments}+
          Scopus documents with under {p.thresholds.volumeTopShare}% in Q1/Q2 and under {p.thresholds.volumeCitationsPerPaper} citations per paper.
        </p>
      </div>
    </Card>
  );
}
