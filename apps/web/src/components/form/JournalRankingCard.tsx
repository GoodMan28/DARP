'use client';

import { useEffect, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Card } from '@/components/ui';
import { normIssn, rankingTexts, type JournalRanking } from '@darp/shared/journals';

/**
 * The journal's indexing, quartile and Impact Factor, looked up from the ISSN on the form as it is
 * fetched or typed. Shown, never saved: the same figures are worked out again wherever the paper
 * appears, from the latest lists IQAC has loaded.
 */
export function JournalRankingCard({ issn, year }: { issn: string; year: string }) {
  const [ranking, setRanking] = useState<JournalRanking | null>(null);
  const [failed, setFailed] = useState(false);
  const key = normIssn(issn);

  useEffect(() => {
    if (!key) { setRanking(null); return; }
    let live = true;
    // Typing an ISSN changes it on every key press: ask once it has settled.
    const t = setTimeout(() => {
      void apiJson<JournalRanking>(`/api/journals/ranking?issn=${key}${/^\d{4}$/.test(year) ? `&year=${year}` : ''}`)
        .then((res) => {
          if (!live) return;
          setFailed(!res.ok);
          setRanking(res.ok ? res.data : null);
        });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [key, year]);

  if (!key) return null;
  const t = ranking ? rankingTexts(ranking) : null;
  const rows: Array<[string, string]> = t
    ? [
      ['Indexed in', t.indexes],
      ['Quartile (SJR)', t.sjrQuartile],
      ['Impact Factor (Web of Science)', t.jif],
      ['JIF quartile (Web of Science)', t.jifQuartile],
    ]
    : [];

  return (
    <Card className="mb-4" padded={false}>
      <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Journal ranking (latest lists)</h2>
      <div className="p-4">
        {failed ? (
          <p className="text-sm text-ink-muted">The ranking could not be looked up just now.</p>
        ) : !t ? (
          <p className="text-sm text-ink-muted">Looking up the journal…</p>
        ) : (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-ink-muted">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-3 text-xs text-ink-muted">
          Worked out from the ISSN and the newest journal lists, not typed. NA means the journal is not in that list.
        </p>
      </div>
    </Card>
  );
}
