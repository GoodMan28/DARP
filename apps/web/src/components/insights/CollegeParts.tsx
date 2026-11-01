'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Table, Th, Td } from '@/components/ui';
import { cx } from '@/lib/cx';
import { num, rupeesShort } from '@/components/charts/theme';
import { FacultyGrid } from './FacultyGrid';
import type { CollegeInsights, PersonCard } from '@darp/shared/contracts';

type Dept = CollegeInsights['departments'][number];

const TILES_AT_FIRST = 12;

/** Department tiles, each opening that department's page: the first twelve, then "View more". */
export function DepartmentTiles({ rows }: { rows: Dept[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, TILES_AT_FIRST);
  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((d) => (
          <li key={d.code}>
            <Link href={`/department/${encodeURIComponent(d.code)}`} className="block h-full rounded-lg bg-surface p-4 shadow-sm ring-1 ring-line transition-shadow hover:shadow-md">
              <p className="text-sm font-semibold text-ink">{d.name}</p>
              <p className="mt-0.5 text-2xs text-ink-muted"><span className="font-mono tabular-nums">{num(d.faculty)}</span> faculty · {d.code}</p>
              <p className="mt-3 text-2xs text-maroon-700">Open the department</p>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length > TILES_AT_FIRST && !all ? (
        <div className="mt-4 text-center">
          <button type="button" onClick={() => setAll(true)} className="rounded-sm border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-ink-50">
            View more ({rows.length - TILES_AT_FIRST})
          </button>
        </div>
      ) : null}
    </div>
  );
}

const COLUMNS = [
  { key: 'name', label: 'Department' }, { key: 'faculty', label: 'Faculty' }, { key: 'papers', label: 'Publications' },
  { key: 'patents', label: 'Patents' }, { key: 'projects', label: 'Projects' }, { key: 'funding', label: 'Funding' },
  { key: 'citations', label: 'Citations' }, { key: 'hIndex', label: 'h-index' },
] as const;
type SortKey = (typeof COLUMNS)[number]['key'];

/** Every department side by side. Click a heading to sort by it. */
export function DepartmentTable({ rows }: { rows: Dept[] }) {
  const [sort, setSort] = useState<SortKey>('papers');
  const sorted = useMemo(() => [...rows].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b[sort] - a[sort] || a.name.localeCompare(b.name))), [rows, sort]);
  return (
    <div className="overflow-x-auto rounded-lg bg-surface shadow-sm ring-1 ring-line">
      <Table className="min-w-[44rem]">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <Th key={c.key} className={cx(c.key !== 'name' && 'text-right')}>
                <button type="button" onClick={() => setSort(c.key)} className={cx('font-semibold hover:text-ink', sort === c.key ? 'text-maroon-700' : 'text-inherit')}>
                  {c.label}{sort === c.key ? ' ↓' : ''}
                </button>
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.code} className="hover:bg-surface-2">
              <Td><Link href={`/department/${encodeURIComponent(d.code)}`} className="font-medium text-primary hover:underline">{d.name}</Link></Td>
              <Td className="text-right font-mono tabular-nums">{num(d.faculty)}</Td>
              <Td className="text-right font-mono tabular-nums">{num(d.papers)}</Td>
              <Td className="text-right font-mono tabular-nums">{num(d.patents)}</Td>
              <Td className="text-right font-mono tabular-nums">{num(d.projects)}</Td>
              <Td className="text-right font-mono tabular-nums">{d.funding > 0 ? rupeesShort(d.funding) : '—'}</Td>
              <Td className="text-right font-mono tabular-nums">{num(d.citations)}</Td>
              <Td className="text-right font-mono tabular-nums">{num(d.hIndex)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

/** The top researchers, by papers or by citations. */
export function TopResearchers({ byPapers, byCitations }: { byPapers: PersonCard[]; byCitations: PersonCard[] }) {
  const [by, setBy] = useState<'papers' | 'citations'>('papers');
  return (
    <div>
      <div role="group" aria-label="Rank by" className="mb-4 flex gap-2">
        {([['papers', 'Publications'], ['citations', 'Citations']] as const).map(([key, label]) => (
          <button
            key={key} type="button" aria-pressed={by === key} onClick={() => setBy(key)}
            className={cx('rounded-full px-3 py-1 text-2xs font-semibold', by === key ? 'bg-maroon-700 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200')}
          >
            {label}
          </button>
        ))}
      </div>
      <FacultyGrid people={(by === 'papers' ? byPapers : byCitations).slice(0, 8)} heading="top researchers" showDepartment />
    </div>
  );
}
