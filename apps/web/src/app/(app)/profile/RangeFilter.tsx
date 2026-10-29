'use client';

import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { Select } from '@/components/ui';

/** From and To years for the profile totals. The choice lives in the address, so it can be shared. */
export function RangeFilter({
  from, to, minYear, maxYear,
}: { from: number; to: number; minYear: number; maxYear: number }) {
  const router = useRouter();
  const id = useId();
  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);

  function go(nextFrom: number, nextTo: number) {
    // Keep the pair in order: moving one end past the other drags the other with it.
    const f = Math.min(nextFrom, nextTo);
    const t = Math.max(nextFrom, nextTo);
    router.push(`/profile?from=${f}&to=${t}`);
  }

  return (
    <div className="mb-4 rounded-sm border border-line bg-surface p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`${id}-from`} className="mb-1 block text-xs font-semibold text-ink-muted">From</label>
          <Select id={`${id}-from`} value={from} onChange={(e) => go(Number(e.target.value), to)}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor={`${id}-to`} className="mb-1 block text-xs font-semibold text-ink-muted">To</label>
          <Select id={`${id}-to`} value={to} onChange={(e) => go(from, Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
        <p className="pb-2 text-sm text-ink-muted">
          Counting records dated between {from} and {to}. Calendar-year figures use {from}–{to}; financial and academic
          years are named by the year they start in. Totals “since joining” always count every year.
        </p>
      </div>
    </div>
  );
}
