'use client';

import { useId, useState, type ReactNode } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Button, Card, CardHeader, FileInput, Input, Notice, Table, Td, Th } from '@/components/ui';
import { IconAlert, IconCheck } from '@/components/shell/Icon';
import { cx } from '@/lib/cx';
import { formatDate } from '@darp/shared/format';
import { effectiveScopus, type MetricsRow, type ResearchProfile } from '@darp/shared/research';

const n = (v: number | null | undefined) => (v === null || v === undefined ? 'NA' : v.toLocaleString('en-IN'));

type Tone = 'success' | 'warning' | 'neutral';
const TONE: Record<Tone, string> = {
  success: 'border-success-100 bg-success-50 text-success-700',
  warning: 'border-warning-100 bg-warning-50 text-warning-700',
  neutral: 'border-line bg-surface-2 text-ink-muted',
};

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Glyph = tone === 'success' ? IconCheck : tone === 'warning' ? IconAlert : null;
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-2xs font-semibold', TONE[tone])}>
      {Glyph ? <Glyph width={11} height={11} /> : null}
      {children}
    </span>
  );
}

/** Three figures of one source, as tiles. */
function Tiles({ row }: { row: MetricsRow | null }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {([['Documents', row?.documents], ['Citations', row?.citations], ['h-index', row?.hIndex]] as const).map(([label, v]) => (
        <div key={label} className="rounded-sm border border-line bg-surface-2 px-2 py-2">
          <dt className="text-2xs font-semibold text-ink-muted">{label}</dt>
          <dd className="mt-0.5 font-mono text-xl font-semibold tabular-nums">{row ? n(v) : '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function SourceCard({ title, status, row, note, children }: {
  title: string; status: { tone: Tone; text: string }; row: MetricsRow | null; note?: string; children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-sm border border-line p-3" aria-label={title}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="mt-1"><Badge tone={status.tone}>{status.text}</Badge></div>
      </div>
      <Tiles row={row} />
      {note ? <p className="text-2xs text-ink-muted">{note}</p> : null}
      {children}
    </section>
  );
}

/** A box for figures read off a profile page: numbers, the date, and a screenshot as the evidence. */
function TypedForm({ open, title, intro, blocked, fields, values, onChange, required, screenshot, fieldKey, busy, anyBusy, error, button, onSave }: {
  open: boolean; title: string; intro: string; blocked: string | null;
  fields: Array<[string, string]>; values: Record<string, string>; onChange: (key: string, value: string) => void; required: string[];
  screenshot: string; fieldKey: string; busy: boolean; anyBusy: boolean; error: Record<string, string>; button: string; onSave: () => void;
}) {
  const id = useId();
  const ready = required.every((k) => values[k]) && !!values.evidenceId;
  const key = fieldKey === 'wosEvidence' ? 'wos' : 'scopus';
  return (
    <details className="border-b border-line" open={open}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{title}</summary>
      <div className="px-4 pb-4">
        <p className="text-xs text-ink-muted">{intro}</p>
        {blocked ? <Notice tone="info" className="mt-2">{blocked}</Notice> : null}
        <div className="mt-2 grid gap-3 sm:grid-cols-5">
          {fields.map(([k, label]) => (
            <div key={k}>
              <label htmlFor={`${id}-${k}`} className="mb-1 block text-xs font-semibold text-ink-muted">{label}</label>
              <Input id={`${id}-${k}`} inputMode="numeric" value={values[k] ?? ''} onChange={(e) => onChange(k, e.target.value.replace(/\D/g, ''))} />
            </div>
          ))}
          <div>
            <label htmlFor={`${id}-asof`} className="mb-1 block text-xs font-semibold text-ink-muted">As on</label>
            <Input id={`${id}-asof`} type="date" value={values.asOf ?? ''} onChange={(e) => onChange('asOf', e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <span className="mb-1 block text-xs font-semibold text-ink-muted">{screenshot}</span>
          <FileInput fieldKey={fieldKey} moduleKey="" accept={['png', 'jpg', 'jpeg', 'pdf']} maxSizeMB={2}
            value={values.evidenceId || undefined} onUploaded={(fileId) => onChange('evidenceId', fileId)} />
          {error.evidenceId ? <p className="mt-1 text-xs text-danger-700">{error.evidenceId}</p> : null}
          {error.asOf ? <p className="mt-1 text-xs text-danger-700">{error.asOf}</p> : null}
          {error.scopusAuthorId ? <p className="mt-1 text-xs text-danger-700">{error.scopusAuthorId}</p> : null}
        </div>
        <div className="mt-3">
          <Button variant="secondary" disabled={anyBusy || !!blocked || !ready} onClick={onSave}>
            {busy ? 'Saving…' : button}
          </Button>
          {error[key] ? <Notice tone="danger" className="mt-2">{error[key]}</Notice> : null}
        </div>
      </div>
    </details>
  );
}

/**
 * A researcher's figures from Scopus, Web of Science and OpenAlex. Connecting the IDs to ORCID is the
 * best route: DARP then reads them from ORCID and they count as verified. An ID can still be typed;
 * the figures are then fetched and verified by comparing the person's surname with the papers.
 */
export function ResearchCard({ initial }: { initial: ResearchProfile }) {
  const id = useId();
  const [p, setP] = useState(initial);
  const [scopusId, setScopusId] = useState(initial.scopusAuthorId ?? '');
  const [rid, setRid] = useState(initial.researcherId ?? '');
  const [wos, setWos] = useState<Record<string, string>>({
    documents: String(initial.wos?.typed ? initial.wos.documents ?? '' : ''),
    citationsExclSelf: String(initial.wos?.typed ? initial.wos.citationsExclSelf ?? '' : ''),
    hIndex: String(initial.wos?.typed ? initial.wos.hIndex ?? '' : ''),
    asOf: new Date().toISOString().slice(0, 10),
    evidenceId: initial.wos?.typed ? initial.wos.evidenceId ?? '' : '',
  });
  const [sc, setSc] = useState<Record<string, string>>({
    documents: String(initial.scopusTyped?.documents ?? ''),
    citations: String(initial.scopusTyped?.citations ?? ''),
    citationsExclSelf: String(initial.scopusTyped?.citationsExclSelf ?? ''),
    hIndex: String(initial.scopusTyped?.hIndex ?? ''),
    asOf: new Date().toISOString().slice(0, 10),
    evidenceId: initial.scopusTyped?.evidenceId ?? '',
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

  /** One button: saves the typed IDs when they changed, then fetches every source. */
  async function saveAndFetch() {
    setBusy('fetch');
    setError({});
    setSaved(null);
    let latest = p;
    if (typedIdChanged) {
      const res = await apiJson<ResearchProfile>('/api/profile/research/ids', {
        method: 'PUT',
        body: JSON.stringify({
          ...(scopusFromOrcid ? {} : { scopusAuthorId: scopusId.trim() || null }),
          ...(ridFromOrcid ? {} : { researcherId: rid.trim() || null }),
        }),
      });
      if (!res.ok) {
        setBusy(null);
        setError({ ...(res.error.fields ?? {}), ids: res.error.fields ? '' : res.error.message });
        return;
      }
      latest = res.data;
      setP(res.data);
    }
    const fetched = await apiJson<ResearchProfile>('/api/profile/research/refresh', { method: 'POST', body: JSON.stringify({}) });
    setBusy(null);
    if (!fetched.ok) { setP(latest); setError({ refresh: fetched.error.message }); return; }
    setP(fetched.data);
    setScopusId(fetched.data.scopusAuthorId ?? '');
    setRid(fetched.data.researcherId ?? '');
    setSaved('fetch');
  }

  const c = p.scopusCheck;
  const scopusRow = effectiveScopus(p.scopus, p.scopusTyped);
  const scopusFromOrcid = p.idsFromOrcid.scopusAuthorId;
  const ridFromOrcid = p.idsFromOrcid.researcherId;

  const scopusStatus = ((): { tone: Tone; text: string } => {
    if (!p.scopusAuthorId) return { tone: 'neutral', text: 'No Scopus ID yet' };
    if (!p.scopusConnected && !p.scopusTyped) return { tone: 'neutral', text: 'Waiting for BIT’s Elsevier key' };
    if (!p.scopus && p.scopusTyped) return { tone: 'success', text: 'Typed by you, with a screenshot' };
    if (!p.scopus) return { tone: 'neutral', text: 'Not fetched yet: press Save and fetch' };
    if (scopusFromOrcid) return { tone: 'success', text: 'Verified: on your ORCID record' };
    if (p.scopus.verified !== false) return { tone: 'success', text: 'Verified: your surname is on the papers' };
    return {
      tone: 'warning',
      text: c?.nameShare !== undefined ? `Not verified: ${Math.round(c.nameShare * 100)}% of the papers carry your surname` : 'Not verified: the name differs',
    };
  })();
  const wosStatus = ((): { tone: Tone; text: string } => {
    if (p.wos?.typed) return { tone: 'success', text: 'Typed by you, with a screenshot' };
    if (!p.researcherId) return { tone: 'neutral', text: 'No ResearcherID yet' };
    if (!p.wosConnected) return { tone: 'neutral', text: 'Not connected yet: type the figures below' };
    if (!p.wos) return { tone: 'neutral', text: 'Not fetched yet: press Save and fetch' };
    if (ridFromOrcid) return { tone: 'success', text: 'Verified: on your ORCID record' };
    if (p.wos.verified !== false) return { tone: 'success', text: 'Verified: the profile is yours' };
    return { tone: 'warning', text: `Not verified: the profile is under ${c?.wos?.wosName || 'another name'}` };
  })();
  const openAlexStatus = ((): { tone: Tone; text: string } => {
    if (!p.orcid) return { tone: 'neutral', text: 'Add your ORCID iD first' };
    if (!p.orcidTrusted) return { tone: 'warning', text: 'Your ORCID iD is not confirmed' };
    return p.openalex ? { tone: 'success', text: 'Found through your ORCID iD' } : { tone: 'neutral', text: 'Not found on OpenAlex yet' };
  })();

  const dateOf = (row: MetricsRow | null, typed = false) => (row ? `${typed ? 'Typed' : 'Fetched'} ${formatDate(row.asOf)}` : null);
  const steps: Array<[string, string, boolean, ReactNode]> = [
    ['Add your ORCID iD', 'Under Account, above.', p.orcidTrusted, null],
    ['Connect Scopus to ORCID', 'On your Scopus author page choose “Connect to ORCID”.', scopusFromOrcid,
      <a key="s" className="underline" target="_blank" rel="noreferrer"
        href={p.scopusAuthorId ? `https://www.scopus.com/authid/detail.uri?authorId=${encodeURIComponent(p.scopusAuthorId)}` : 'https://www.scopus.com/freelookup/form/author.uri'}>
        Open Scopus
      </a>],
    ['Connect Web of Science to ORCID', 'In your Web of Science researcher profile, add your ORCID iD.', ridFromOrcid,
      <a key="w" className="underline" target="_blank" rel="noreferrer" href="https://www.webofscience.com/">Open Web of Science</a>],
  ];

  const typedIdChanged = scopusId.trim() !== (p.scopusAuthorId ?? '') || rid.trim().toUpperCase() !== (p.researcherId ?? '');

  return (
    <Card className="mb-4" padded={false}>
      <CardHeader title="Your research figures" subtitle="Documents, citations and h-index in Scopus, Web of Science and OpenAlex." />

      {/* The best route, in three steps */}
      <div className="border-b border-line p-4">
        <h3 className="text-sm font-semibold">Connect once and your figures verify themselves</h3>
        <ol className="mt-2 grid gap-2 sm:grid-cols-3">
          {steps.map(([title, text, done, link], i) => (
            <li key={title} className={cx('flex gap-2 rounded-sm border p-2.5', done ? 'border-success-100 bg-success-50' : 'border-line bg-surface-2')}>
              <span className={cx('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-bold',
                done ? 'bg-success-700 text-white' : 'bg-line text-ink-muted')}>
                {done ? <IconCheck width={11} height={11} /> : i + 1}
              </span>
              <div className="text-xs">
                <p className="font-semibold">{title}</p>
                <p className="mt-0.5 text-ink-muted">{text}</p>
                {link && !done ? <p className="mt-1">{link}</p> : null}
              </div>
            </li>
          ))}
        </ol>
        {p.orcid && !p.orcidTrusted ? (
          <Notice tone="warning" className="mt-3">
            Your ORCID iD is saved, but its record is not under your account’s name, so DARP does not read IDs from it.
          </Notice>
        ) : null}
        <p className="mt-3 text-xs text-ink-muted">
          After connecting, press <strong>Save and fetch</strong>. Not connected? Type your IDs below. DARP still fetches your figures and compares your
          surname with the papers; it marks them “Not verified” when unsure.
        </p>
      </div>

      {/* One card per source */}
      <div className="grid gap-3 p-4 lg:grid-cols-3">
        <SourceCard title="Scopus" status={scopusStatus} row={scopusRow}
          note={[dateOf(p.scopus), dateOf(p.scopusTyped, true), p.scopus && p.scopusBitDocuments !== null ? `${n(p.scopusBitDocuments)} written at BIT` : null].filter(Boolean).join(' · ') || undefined}>
          <div>
            <label htmlFor={`${id}-scopus`} className="mb-1 block text-xs font-semibold text-ink-muted">Scopus Author ID</label>
            {scopusFromOrcid ? (
              <p id={`${id}-scopus`} className="font-mono text-sm">{scopusId}</p>
            ) : (
              <Input id={`${id}-scopus`} className="font-mono" inputMode="numeric" placeholder="57200000001" value={scopusId} onChange={(e) => setScopusId(e.target.value)} />
            )}
            {error.scopusAuthorId ? <p className="mt-1 text-xs text-danger-700">{error.scopusAuthorId}</p> : null}
            {p.scopusAuthorId ? (
              <a className="mt-1 inline-block text-xs underline" target="_blank" rel="noreferrer"
                href={`https://www.scopus.com/authid/detail.uri?authorId=${encodeURIComponent(p.scopusAuthorId)}`}>
                Is this you? Open this Scopus page
              </a>
            ) : null}
          </div>
        </SourceCard>

        <SourceCard title="Web of Science" status={wosStatus} row={p.wos} note={dateOf(p.wos, p.wos?.typed) ?? undefined}>
          <div>
            <label htmlFor={`${id}-rid`} className="mb-1 block text-xs font-semibold text-ink-muted">ResearcherID</label>
            {ridFromOrcid ? (
              <p id={`${id}-rid`} className="font-mono text-sm">{rid}</p>
            ) : (
              <Input id={`${id}-rid`} className="font-mono" placeholder="AAB-1234-2020" value={rid} onChange={(e) => setRid(e.target.value)} />
            )}
            {error.researcherId ? <p className="mt-1 text-xs text-danger-700">{error.researcherId}</p> : null}
          </div>
        </SourceCard>

        <SourceCard title="OpenAlex" status={openAlexStatus} row={p.openalex}
          note={dateOf(p.openalex) ?? 'Free and automatic: found through your ORCID iD.'} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 pb-4">
        {p.orcidTrusted || scopusId.trim() || rid.trim() ? (
          <Button disabled={busy !== null} onClick={() => void saveAndFetch()}>
            {busy === 'fetch' ? 'Saving and fetching…' : 'Save and fetch'}
          </Button>
        ) : null}
        {saved ? <span className="text-xs text-success-700">Saved and fetched.</span> : null}
        {error.ids || error.refresh ? <Notice tone="danger" className="w-full">{error.ids || error.refresh}</Notice> : null}
        <p className="w-full text-2xs text-ink-muted">Refreshed automatically each month.</p>
      </div>

      {/* Every figure, side by side */}
      <details className="border-b border-line">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Compare every figure</summary>
        <Table>
          <thead>
            <tr>
              <Th>Figure</Th>
              <Th className="text-right">Scopus (fetched)</Th>
              <Th className="text-right">Scopus (typed)</Th>
              <Th className="text-right">Web of Science</Th>
              <Th className="text-right">OpenAlex</Th>
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
                {[p.scopus, p.scopusTyped, p.wos, p.openalex].map((row, i) => (
                  <Td key={i} className="text-right font-mono tabular-nums">{row ? n(get(row)) : '—'}</Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="px-4 py-2 text-2xs text-ink-muted">
          OpenAlex counts more kinds of sources than Scopus or Web of Science, so its numbers are usually higher. NA: the source does
          not give that figure{c?.noCitationOverview ? ' (Scopus figures without self-citations need Elsevier’s Citation Overview, not enabled for BIT yet)' : ''}.
        </p>
      </details>

      {/* Typed Scopus figures: always open, with a screenshot */}
      <TypedForm
        open={!p.scopus && !p.scopusTyped}
        title="Type your Scopus figures"
        intro="Use this when the fetched figures are missing, or to add the citations without self-citations (Scopus shows them on your author page under “Citation overview”). Attach a screenshot of your Scopus author page. IQAC can see it."
        blocked={p.scopusAuthorId ? null : 'Save your Scopus Author ID first.'}
        fields={[['documents', 'Documents'], ['citations', 'Citations'], ['citationsExclSelf', 'Citations without self-citations (optional)'], ['hIndex', 'h-index']]}
        values={sc} onChange={(k, v) => setSc((x) => ({ ...x, [k]: v }))}
        required={['documents', 'citations', 'hIndex']}
        screenshot="Screenshot of your Scopus author page" fieldKey="scopusEvidence"
        busy={busy === 'scopus'} anyBusy={busy !== null} error={error}
        button="Save Scopus figures"
        onSave={() => void call('scopus', '/api/profile/research/scopus', 'POST', {
          documents: Number(sc.documents), citations: Number(sc.citations),
          citationsExclSelf: sc.citationsExclSelf === '' ? null : Number(sc.citationsExclSelf), hIndex: Number(sc.hIndex),
          asOf: sc.asOf, evidenceId: sc.evidenceId,
        })}
      />

      {/* Typed WoS figures, while Clarivate is not connected */}
      {!p.wosConnected ? (
        <TypedForm
          open={!p.wos}
          title="Type your Web of Science figures"
          intro="Until BIT connects Clarivate’s Web of Science API, type the figures from your Web of Science researcher profile and attach a screenshot of them. IQAC can see the screenshot."
          blocked={null}
          fields={[['documents', 'Documents'], ['citationsExclSelf', 'Times cited without self-citations'], ['hIndex', 'h-index']]}
          values={wos} onChange={(k, v) => setWos((x) => ({ ...x, [k]: v }))}
          required={['documents', 'citationsExclSelf', 'hIndex']}
          screenshot="Screenshot of your Web of Science metrics" fieldKey="wosEvidence"
          busy={busy === 'wos'} anyBusy={busy !== null} error={error}
          button="Save Web of Science figures"
          onSave={() => void call('wos', '/api/profile/research/wos', 'POST', {
            documents: Number(wos.documents), citationsExclSelf: Number(wos.citationsExclSelf), hIndex: Number(wos.hIndex),
            asOf: wos.asOf, evidenceId: wos.evidenceId,
          })}
        />
      ) : null}
    </Card>
  );
}
