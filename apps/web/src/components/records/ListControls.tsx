'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Select, Button } from '@/components/ui';
import { IconSearch, IconFilter } from '@/components/shell/Icon';

export interface PeriodOption { year: number; label: string }

interface Props {
  moduleKey: string;
  moduleName: string;
  /** Current values, read server-side from searchParams and passed down. */
  q: string;
  status: string;
  year: string;
  periods: PeriodOption[];
}

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'verified', label: 'Verified' },
  { value: 'approved', label: 'Approved' },
  { value: 'returned', label: 'Returned' },
];

/**
 * The filter bar above the table. It owns no data: every change is written to the
 * URL query, and the server component re-renders the table from the new query.
 * That keeps the list shareable, bookmarkable and back-button correct.
 */
export function ListControls({ moduleKey, moduleName, q, status, year, periods }: Props) {
  const router = useRouter();
  const [text, setText] = useState(q);
  const [pending, setPending] = useState(false);
  const searchId = useId();
  const statusId = useId();
  const yearId = useId();
  const typed = useRef(false);

  // Keep the box in step when the URL changes from elsewhere (a status chip, Clear, back).
  useEffect(() => { setText(q); typed.current = false; }, [q]);

  function apply(next: { q?: string; status?: string; year?: string }) {
    const params = new URLSearchParams();
    const nq = next.q ?? text;
    const ns = next.status ?? status;
    const ny = next.year ?? year;
    if (nq.trim()) params.set('q', nq.trim());
    if (ns) params.set('status', ns);
    if (ny) params.set('year', ny);
    // Any filter change returns to the first page — page 2 of the old result set is meaningless.
    const query = params.toString();
    setPending(true);
    router.push(query ? `/m/${moduleKey}?${query}` : `/m/${moduleKey}`);
  }

  // Debounce typing so a search is one navigation, not one per keystroke.
  useEffect(() => {
    if (!typed.current) return;
    const t = setTimeout(() => { apply({ q: text }); }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => { setPending(false); }, [q, status, year]);

  const dirty = !!(q || status || year);

  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); apply({ q: text }); }}
      className="flex flex-wrap items-end gap-2 border-b border-line bg-surface-2 px-3 py-2.5"
    >
      <div className="min-w-0 flex-1 sm:max-w-xs">
        <label htmlFor={searchId} className="mb-1 block text-2xs font-bold uppercase tracking-wider text-ink-faint">
          Search
        </label>
        <div className="relative">
          <IconSearch
            width={14}
            height={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <Input
            id={searchId}
            type="search"
            value={text}
            onChange={(e) => { typed.current = true; setText(e.target.value); }}
            placeholder={`Search ${moduleName.toLowerCase()}…`}
            className="pl-8"
          />
        </div>
      </div>

      <div className="w-40">
        <label htmlFor={statusId} className="mb-1 block text-2xs font-bold uppercase tracking-wider text-ink-faint">
          Status
        </label>
        <Select
          id={statusId}
          value={status}
          onChange={(e) => apply({ status: e.target.value })}
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>

      <div className="w-44">
        <label htmlFor={yearId} className="mb-1 block text-2xs font-bold uppercase tracking-wider text-ink-faint">
          Reporting period
        </label>
        <Select id={yearId} value={year} onChange={(e) => apply({ year: e.target.value })}>
          <option value="">All periods</option>
          {periods.map((p) => <option key={p.year} value={String(p.year)}>{p.label}</option>)}
        </Select>
      </div>

      <Button type="submit" variant="secondary" disabled={pending}>
        <IconFilter width={13} height={13} />
        {pending ? 'Filtering…' : 'Apply'}
      </Button>

      {dirty ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => { setText(''); apply({ q: '', status: '', year: '' }); }}
        >
          Clear filters
        </Button>
      ) : null}
    </form>
  );
}
