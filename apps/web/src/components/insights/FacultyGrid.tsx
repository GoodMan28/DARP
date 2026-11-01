'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Avatar } from '@/components/charts/Avatar';
import { Empty } from '@/components/charts/Empty';
import { num } from '@/components/charts/theme';
import type { PersonCard } from '@darp/shared/contracts';

const PAGE = 12;

/** Cards for people: initials, name, designation, three figures, and a link to their page. Filter by name, 12 at a time. */
export function FacultyGrid({ people, heading = 'faculty', showDepartment = false }: { people: PersonCard[]; heading?: string; showDepartment?: boolean }) {
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return words.length === 0 ? people : people.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)));
  }, [people, q]);
  const visible = rows.slice(0, shown);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink"><span className="font-mono tabular-nums">{num(people.length)}</span> {heading}</h3>
        <input
          type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Find by name" aria-label="Find a person by name"
          className="min-h-9 w-full max-w-xs rounded-sm border border-line bg-surface px-3 text-sm sm:w-64"
        />
      </div>
      {visible.length === 0 ? <Empty thing="people with that name" /> : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <li key={p.userId} className="flex flex-col rounded-lg bg-surface p-4 shadow-sm ring-1 ring-line transition-shadow hover:shadow-md">
              <div className="flex items-start gap-3">
                <Avatar name={p.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                  <p className="truncate text-2xs text-ink-muted">{p.designation}{showDepartment && p.departmentCode ? ` · ${p.departmentCode}` : ''}</p>
                </div>
                {p.orcid ? <span className="ml-auto shrink-0 rounded-full bg-success-50 px-2 py-0.5 text-2xs font-semibold text-success-700">ORCID</span> : null}
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                {([['Papers', p.papers], ['Citations', p.citations], ['h-index', p.hIndex]] as const).map(([label, v]) => (
                  <div key={label} className="rounded-sm bg-ink-50 py-1.5">
                    <dd className="font-mono text-base font-semibold tabular-nums text-ink">{num(v)}</dd>
                    <dt className="text-2xs text-ink-muted">{label}</dt>
                  </div>
                ))}
              </dl>
              <Link href={`/people/${p.userId}`} className="mt-3 self-start text-sm font-semibold text-maroon-700 hover:underline">Profile</Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length > shown ? (
        <div className="mt-4 text-center">
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="rounded-sm border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-ink-50">
            Show more ({rows.length - shown} left)
          </button>
        </div>
      ) : null}
    </div>
  );
}
