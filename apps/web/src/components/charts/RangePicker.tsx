'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui';

/**
 * From, To and "All years": the years a page counts, kept in the address (?from=2022&to=2024) so a page can
 * be shared. The page opens on All years, not on IQAC's report range.
 */
export function RangePicker(props: { minYear: number; maxYear: number }) {
  return <Suspense fallback={null}><Picker {...props} /></Suspense>;
}

function Picker({ minYear, maxYear }: { minYear: number; maxYear: number }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const from = Number(params.get('from')) || null;
  const to = Number(params.get('to')) || null;
  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y -= 1) years.push(y);

  function go(f: number | null, t: number | null) {
    const q = new URLSearchParams(params.toString());
    q.delete('from'); q.delete('to');
    if (f !== null && t !== null) { q.set('from', String(Math.min(f, t))); q.set('to', String(Math.max(f, t))); }
    const qs = q.toString();
    router.push(qs ? `${path}?${qs}` : path);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Years counted">
      <button
        type="button" onClick={() => go(null, null)} aria-pressed={from === null}
        className={`rounded-full px-3 py-1 text-2xs font-semibold ${from === null ? 'bg-maroon-700 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}
      >
        All years
      </button>
      <label className="flex items-center gap-1.5 text-ink-muted">
        From
        <Select aria-label="From year" value={from ?? ''} onChange={(e) => go(Number(e.target.value), to ?? maxYear)}>
          <option value="" disabled>—</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
      </label>
      <label className="flex items-center gap-1.5 text-ink-muted">
        To
        <Select aria-label="To year" value={to ?? ''} onChange={(e) => go(from ?? minYear, Number(e.target.value))}>
          <option value="" disabled>—</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
      </label>
    </div>
  );
}
