'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiJson } from '@/lib/csrf-client';
import { Checkbox, Notice } from '@/components/ui';
import type { PeriodType } from '@darp/shared/modules/types';

/** A year named the way the module counts years: 2024, FY 2024-25 or AY 2024-25. */
function yearLabel(year: number, type: PeriodType): string {
  if (type === 'CY') return String(year);
  return `${type} ${year}-${String(year + 1).slice(-2)}`;
}

/**
 * "Nothing to report for a year." Without this, an empty module is ambiguous:
 * nobody can tell a faculty member who has no patents from one who has not started.
 */
export function NilDeclaration({
  moduleKey, moduleName, periodType, declaredYears, years,
}: { moduleKey: string; moduleName: string; periodType: PeriodType; declaredYears: number[]; years: number[] }) {
  const router = useRouter();
  const [year, setYear] = useState<number>(years[0] ?? new Date().getFullYear());
  const [on, setOn] = useState(declaredYears.includes(years[0] ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    setOn(next);
    const res = await apiJson<{ declaredNil: boolean }>(`/api/modules/${moduleKey}/declare`, {
      method: 'POST',
      body: JSON.stringify({ declaredNil: next, year }),
    });
    setBusy(false);
    if (!res.ok) {
      setOn(!next);                        // roll the checkbox back to the server's truth
      setError(res.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="border-t border-line bg-surface-2 px-3 py-3">
      <label htmlFor={id} className="flex items-start gap-2.5 text-sm text-ink">
        <Checkbox
          id={id}
          className="mt-0.5"
          checked={on}
          disabled={busy}
          aria-describedby={`${id}-help`}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span>
          <span className="font-semibold">Nothing to report in {moduleName} for</span>
          <select
            aria-label="Year"
            className="ml-2 min-h-9 rounded-sm border border-line bg-surface px-2 text-sm"
            value={year}
            disabled={busy}
            onChange={(e) => { const y = Number(e.target.value); setYear(y); setOn(declaredYears.includes(y)); }}
          >
            {years.map((y) => <option key={y} value={y}>{yearLabel(y, periodType)}</option>)}
          </select>
          <span id={`${id}-help`} className="mt-0.5 block text-xs text-ink-muted">
            Use this when you genuinely have nothing to add for that year. It tells your head of
            department and IQAC that the module is done for that year, not forgotten: it shows as
            complete instead of “Not started”. You can untick it later and add a record as usual.
          </span>
        </span>
      </label>
      {on ? (
        <p className="mt-2 pl-7 text-xs font-semibold text-success-700">
          Declared for {yearLabel(year, periodType)}. IQAC sees this module as complete with no records for that year.
        </p>
      ) : null}
      {declaredYears.length ? (
        <p className="mt-1 pl-7 text-xs text-ink-muted">
          Declared so far: {declaredYears.map((y) => yearLabel(y, periodType)).join(', ')}
        </p>
      ) : null}
      {error ? <Notice tone="danger" className="mt-2">{error}</Notice> : null}
    </div>
  );
}
