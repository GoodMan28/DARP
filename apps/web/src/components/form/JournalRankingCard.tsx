'use client';

import { useEffect, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Card, Input, Select } from '@/components/ui';
import { normIssn, rankingTexts, type JournalRanking } from '@darp/shared/journals';

const QUARTILES = ['Q1', 'Q2', 'Q3', 'Q4', 'NA'];

/**
 * The journal's indexing, quartiles and Impact Factor. They are looked up from the ISSN as it is
 * fetched or typed and shown in the boxes, which the author may change: the lists can be wrong, or
 * not have the journal. A figure is saved with the paper only when it differs from the lists (empty
 * = "use the lists"), so a list loaded later still counts for every paper that was left as it was.
 */
export function JournalRankingCard({ issn, year, journal = '', values, errors, readOnly, onChange }: {
  issn: string;
  year: string;
  /** The journal's name: finds the Impact Factor when the ISSN does not. */
  journal?: string;
  values: Record<string, unknown>;
  errors: Record<string, string>;
  readOnly?: boolean;
  onChange: (key: string, value: unknown) => void;
}) {
  const [ranking, setRanking] = useState<JournalRanking | null>(null);
  const [failed, setFailed] = useState(false);
  /** The Impact Factor as it is being typed; null when the box is not being edited. */
  const [jifDraft, setJifDraft] = useState<string | null>(null);
  const key = normIssn(issn);

  useEffect(() => {
    if (!key && !journal.trim()) { setRanking(null); return; }
    let live = true;
    // Typing an ISSN changes it on every key press: ask once it has settled.
    const t = setTimeout(() => {
      const qs = new URLSearchParams();
      if (key) qs.set('issn', key);
      if (journal.trim()) qs.set('journal', journal.trim());
      if (/^\d{4}$/.test(year)) qs.set('year', year);
      void apiJson<JournalRanking>(`/api/journals/ranking?${qs}`)
        .then((res) => {
          if (!live) return;
          setFailed(!res.ok);
          setRanking(res.ok ? res.data : null);
        });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [key, year, journal]);

  const text = ranking ? rankingTexts(ranking) : null;
  /** What the lists say, as the boxes show it ('NA' = not in the list); null until they are known. */
  const list = ranking
    ? { sjr: ranking.sjrQuartile ?? 'NA', jifQ: ranking.jifQuartile ?? 'NA', jif: ranking.jif ?? 'NA' }
    : null;
  const mine = {
    sjr: String(values.manualSjrQuartile ?? ''),
    jifQ: String(values.manualJifQuartile ?? ''),
    jif: String(values.manualJif ?? ''),
  };

  /** One quartile box: the author's value, else the lists'. */
  const quartile = (label: string, fieldKey: string, own: string, fromList: string | null, source: string | null) => {
    const shown = own || fromList || '';
    const missing = fromList === 'NA' && !own;
    return (
      <div className={own || missing ? `rounded-sm border p-2 ${own ? 'border-warning-100 bg-warning-50' : 'border-line bg-surface-2'}` : undefined}>
        <label htmlFor={`rank-${fieldKey}`} className="mb-1 block text-sm font-semibold">{label}</label>
        {readOnly ? (
          <p className="text-sm">{shown || 'NA'}{own ? ' (typed)' : ''}</p>
        ) : (
          <Select id={`rank-${fieldKey}`} value={shown} aria-invalid={!!errors[fieldKey] || undefined}
            onChange={(e) => onChange(fieldKey, e.target.value === fromList ? '' : e.target.value)}>
            {fromList === null ? <option value="">— Choose —</option> : null}
            {QUARTILES.map((q) => <option key={q} value={q}>{q}</option>)}
          </Select>
        )}
        <Hint own={own} fromList={fromList} source={source} readOnly={readOnly} onReset={() => onChange(fieldKey, '')} />
        {errors[fieldKey] ? <p className="mt-1 text-xs text-danger-700">{errors[fieldKey]}</p> : null}
      </div>
    );
  };

  const jifShown = jifDraft ?? (mine.jif || list?.jif || '');

  return (
    <Card className="mb-4" padded={false}>
      <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Journal ranking</h2>
      <div className="p-4">
        {!key && !ranking ? (
          <p className="mb-3 text-sm text-ink-muted">Enter the ISSN to look the journal up, or type the figures below.</p>
        ) : failed ? (
          <p className="mb-3 text-sm text-ink-muted">The lists could not be read just now. You can type the figures below.</p>
        ) : !text ? (
          <p className="mb-3 text-sm text-ink-muted">Looking up the journal…</p>
        ) : (
          <div className="mb-3 text-sm">
            <span className="text-ink-muted">Indexed in </span><span className="font-semibold">{text.indexes}</span>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {quartile('Quartile (SJR)', 'manualSjrQuartile', mine.sjr, list?.sjr ?? null,
            ranking?.sjrQuartile ? `SJR ${ranking.sjrYear}` : null)}
          {quartile('JIF quartile (Web of Science)', 'manualJifQuartile', mine.jifQ, list?.jifQ ?? null,
            ranking?.jifQuartile ? `JIF ${ranking.jifYear}` : null)}
          <div className={mine.jif || list?.jif === 'NA' ? `rounded-sm border p-2 ${mine.jif ? 'border-warning-100 bg-warning-50' : 'border-line bg-surface-2'}` : undefined}>
            <label htmlFor="rank-manualJif" className="mb-1 block text-sm font-semibold">Impact Factor (Web of Science)</label>
            {ranking?.jifByName ? <p className="mb-1 text-xs text-warning-700">Found by the journal&rsquo;s name, not its ISSN: check it.</p> : null}
            {readOnly ? (
              <p className="text-sm">{jifShown || 'NA'}{mine.jif ? ' (typed)' : ''}</p>
            ) : (
              <Input id="rank-manualJif" inputMode="decimal" placeholder="5.2 or NA" value={jifShown}
                aria-invalid={!!errors.manualJif || undefined}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase().replace(/[^0-9.<NA]/g, '');
                  setJifDraft(v);
                  onChange('manualJif', list && v.trim() === list.jif ? '' : v);
                }}
                onBlur={() => setJifDraft(null)} />
            )}
            <Hint own={mine.jif} fromList={list?.jif ?? null} source={ranking?.jif ? `JIF ${ranking.jifYear}` : null}
              readOnly={readOnly} onReset={() => { setJifDraft(null); onChange('manualJif', ''); }} />
            {errors.manualJif ? <p className="mt-1 text-xs text-danger-700">{errors.manualJif}</p> : null}
          </div>
        </div>
        {!readOnly ? (
          <p className="mt-3 text-xs text-ink-muted">
            Filled in from the journal lists. If a figure is wrong or missing, change it here. NA means the journal is not in that list.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/** Under a box: where its figure comes from, and how to go back to the lists' figure. */
function Hint({ own, fromList, source, readOnly, onReset }: {
  own: string; fromList: string | null; source: string | null; readOnly?: boolean; onReset: () => void;
}) {
  if (own) {
    return (
      <p className="mt-1 text-xs font-semibold text-warning-700">
        {fromList && fromList !== 'NA' ? `Changed by you; the lists say ${fromList}` : 'Typed by you; the lists do not have it'}.{' '}
        {!readOnly ? <button type="button" className="font-semibold underline" onClick={onReset}>Use the list figure</button> : null}
      </p>
    );
  }
  if (fromList === null) return null;
  return (
    <p className="mt-1 text-xs text-ink-muted">
      {fromList === 'NA' ? 'Not in the journal lists. Enter it if you know it.' : `From the lists${source ? ` (${source})` : ''}`}
    </p>
  );
}
