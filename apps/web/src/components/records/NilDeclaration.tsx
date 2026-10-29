'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiJson } from '@/lib/csrf-client';
import { Checkbox, Notice } from '@/components/ui';

/**
 * "Nothing to report this cycle." Without this, an empty module is ambiguous:
 * nobody can tell a faculty member who has no patents from one who has not started.
 */
export function NilDeclaration({
  moduleKey, moduleName, declaredYears, years,
}: { moduleKey: string; moduleName: string; declaredYears: number[]; years: number[] }) {
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
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span id={`${id}-help`} className="mt-0.5 block text-xs text-ink-muted">
            Tick this to declare a nil return. The module then counts as complete in the
            department roll-up instead of showing as outstanding. Untick it at any time and add a
            record as usual.
          </span>
        </span>
      </label>
      {on ? (
        <p className="mt-2 pl-7 text-xs font-semibold text-success-700">
          Declared. IQAC sees this module as complete with no records.
        </p>
      ) : null}
      {error ? <Notice tone="danger" className="mt-2">{error}</Notice> : null}
    </div>
  );
}
