import Link from 'next/link';
import { Hero } from '@/components/charts/Hero';
import { HeroTile } from '@/components/charts/HeroTile';
import { Avatar } from '@/components/charts/Avatar';
import { ChartCard } from '@/components/charts/ChartCard';
import { BarsByYear } from '@/components/charts/BarsByYear';
import { BarList } from '@/components/charts/BarList';
import { Empty } from '@/components/charts/Empty';
import { RangePicker } from '@/components/charts/RangePicker';
import { cx } from '@/lib/cx';
import { formatDate, formatRupees } from '@darp/shared/format';
import type { PersonInsights, TodoItem } from '@darp/shared/contracts';
import { Tabs } from './Tabs';
import { JournalQualityCard, OutputCard, RecentPapers } from './parts';

const TONE: Record<TodoItem['tone'], string> = { danger: 'bg-danger-500', warning: 'bg-warning-500', info: 'bg-info-500' };

function experienceOf(p: PersonInsights['person']): string {
  if (p.experienceMonths !== null) {
    const y = Math.floor(p.experienceMonths / 12);
    return y > 0 ? `${y} yr${y === 1 ? '' : 's'}` : `${p.experienceMonths} mo`;
  }
  return p.joining ? `Since ${p.joining.slice(0, 4)}` : '—';
}

/** "What to do next": what is missing or waiting, most urgent first. */
function TodoCard({ items }: { items: TodoItem[] }) {
  return (
    <ChartCard title="What to do next" subtitle={items.length > 0 ? 'The quickest ways to make your record complete.' : undefined}>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">You are all caught up. Nothing is waiting for you.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((t) => (
            <li key={t.key} className="flex items-center gap-3 py-2.5">
              <span aria-hidden className={cx('h-2 w-2 shrink-0 rounded-full', TONE[t.tone])} />
              <span className="min-w-0 flex-1 text-sm text-ink">{t.label}</span>
              <Link href={t.href} className="shrink-0 rounded-sm px-2 py-1 text-sm font-semibold text-maroon-700 hover:bg-maroon-50">Open</Link>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

/** Scopus, Web of Science and OpenAlex figures as on My profile, each with the day it was read. */
function CitationsCard({ d }: { d: PersonInsights }) {
  const rows = [
    ['Scopus profile', d.profiles.scopus], ['Web of Science', d.profiles.wos], ['OpenAlex', d.profiles.openalex],
  ] as const;
  const have = rows.filter(([, v]) => v);
  return (
    <ChartCard
      title="Citations" subtitle="From each author profile, for all of the person’s papers"
      table={have.length > 0 ? { head: ['Source', 'Citations', 'h-index', 'As on'], rows: have.map(([n, v]) => [n, v!.citations ?? '—', v!.hIndex ?? '—', formatDate(v!.asOf)]) } : undefined}
    >
      {have.length === 0 ? <Empty thing="author profile figures" /> : (
        <ul className="space-y-3">
          {have.map(([name, v]) => (
            <li key={name} className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{name}</p>
                <p className="text-2xs text-ink-muted">as on {formatDate(v!.asOf)}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg font-semibold tabular-nums text-ink">{v!.citations?.toLocaleString('en-IN') ?? '—'}</p>
                <p className="text-2xs text-ink-muted">h-index <span className="font-mono tabular-nums">{v!.hIndex ?? '—'}</span></p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 border-t border-line pt-2 text-2xs text-ink-muted">
        These count every paper on the author profile, from any institute. In DARP: <span className="font-mono tabular-nums">{d.counts.papers}</span> papers entered,
        {' '}<span className="font-mono tabular-nums">{d.citations.found}</span> found in Scopus by DOI
        {d.citations.found > 0 ? <>, h-index <span className="font-mono tabular-nums">{d.citations.hIndex}</span></> : null}.
      </p>
    </ChartCard>
  );
}

/**
 * A person's page, from the hero to their education: the same for the person (with "What to do next") and for
 * a colleague or dean who opens it. `own` turns on the to-do list and the links into the person's modules.
 */
export function PersonStats({ data: d, own, minYear, maxYear }: { data: PersonInsights; own: boolean; minYear: number; maxYear: number }) {
  const p = d.person;
  const link = (href: string) => (own ? href : undefined);
  const years = d.byYear.map((y) => ({ year: y.year, value: y.papers }));

  return (
    <div className="space-y-4">
      <Hero
        lead={<Avatar name={p.name} size="lg" className="bg-white/15 text-white" />}
        title={p.name}
        subtitle={[p.designation === 'Not filled in' ? '' : p.designation, p.department, 'BIT Mesra'].filter(Boolean).join(' · ')}
        chips={[
          p.orcid ? `ORCID ${p.orcid}` : '', p.scopusAuthorId ? `Scopus ${p.scopusAuthorId}` : '', p.researcherId ? `ResearcherID ${p.researcherId}` : '',
        ].filter(Boolean)}
      >
        <HeroTile label="Publications" value={d.counts.papers} href={link('/m/publications')} />
        <HeroTile label="Projects" value={d.counts.projects} href={link('/m/grants')} />
        <HeroTile label="Scopus citations" value={d.profiles.scopus?.citations ?? '—'} note="Scopus profile" />
        <HeroTile label="h-index" value={d.profiles.scopus?.hIndex ?? '—'} note="Scopus profile" />
      </Hero>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangePicker minYear={minYear} maxYear={maxYear} />
        <p className="text-2xs text-ink-muted">
          {d.range ? `Counting ${d.range.from}–${d.range.to}.` : 'Counting every year.'} Experience: <span className="font-mono tabular-nums">{experienceOf(p)}</span>
        </p>
      </div>

      <div className={cx('grid gap-4', own && 'lg:grid-cols-2')}>
        {own ? <TodoCard items={d.todo} /> : null}
        <ChartCard
          title="Publications by year" subtitle="Papers counted, by year of publication"
          table={{ head: ['Year', 'Papers'], rows: years.map((y) => [String(y.year), y.value]) }}
        >
          <BarsByYear data={years} name="Papers" thing="papers" />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <OutputCard counts={d.counts} />
        <JournalQualityCard d={d} />
        <CitationsCard d={d} />
      </div>

      <ChartCard title="Recent publications" subtitle="The eight newest counted papers">
        <RecentPapers papers={d.recentPapers} linkOwn={own} />
        {own ? <p className="mt-3 text-right text-sm"><Link href="/m/publications" className="font-semibold text-maroon-700 hover:underline">See all</Link></p> : null}
      </ChartCard>

      <ChartCard title="Work in other areas" subtitle="Projects, patents, students, awards and memberships">
        <Tabs label="Other work" tabs={[
          {
            id: 'projects', label: 'Projects', count: d.projects.length,
            content: d.projects.length === 0 ? <Empty thing="projects" /> : (
              <ul className="divide-y divide-line">
                {d.projects.map((r) => (
                  <li key={r.id} className="py-2.5 text-sm">
                    <p className="font-medium text-ink">{r.title}</p>
                    <p className="text-2xs text-ink-muted">
                      {[r.role, r.agency, r.period].filter(Boolean).join(' · ')}
                      {r.amount > 0 ? <> · <span className="font-mono tabular-nums">{formatRupees(r.amount)}</span></> : null}
                    </p>
                  </li>
                ))}
              </ul>
            ),
          },
          {
            id: 'patents', label: 'Patents', count: d.patents.length,
            content: d.patents.length === 0 ? <Empty thing="patents" /> : (
              <ul className="divide-y divide-line">
                {d.patents.map((r) => (
                  <li key={r.id} className="py-2.5 text-sm">
                    <p className="font-medium text-ink">{r.title}</p>
                    <p className="text-2xs text-ink-muted">{[r.status, r.number, r.date ? formatDate(r.date) : ''].filter(Boolean).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            ),
          },
          {
            id: 'theses', label: 'Ph.D. students guided', count: d.theses.length,
            content: d.theses.length === 0 ? <Empty thing="Ph.D. students" /> : (
              <ul className="divide-y divide-line">
                {d.theses.map((r) => (
                  <li key={r.id} className="py-2.5 text-sm"><span className="font-medium text-ink">{r.student}</span><span className="text-2xs text-ink-muted"> · {[r.year, r.status].filter(Boolean).join(' · ')}</span></li>
                ))}
              </ul>
            ),
          },
          {
            id: 'awards', label: 'Awards', count: d.awards.length,
            content: d.awards.length === 0 ? <Empty thing="awards" /> : (
              <ul className="divide-y divide-line">
                {d.awards.map((r) => (
                  <li key={r.id} className="py-2.5 text-sm"><span className="font-medium text-ink">{r.title}</span><span className="text-2xs text-ink-muted"> · {[r.by, r.date ? formatDate(r.date) : ''].filter(Boolean).join(' · ')}</span></li>
                ))}
              </ul>
            ),
          },
          {
            id: 'memberships', label: 'Memberships', count: d.memberships.length,
            content: d.memberships.length === 0 ? <Empty thing="memberships" /> : (
              <ul className="divide-y divide-line">
                {d.memberships.map((r) => (
                  <li key={r.id} className="py-2.5 text-sm"><span className="font-medium text-ink">{r.body}</span><span className="text-2xs text-ink-muted"> · {[r.kind, [r.from, r.to].filter(Boolean).join('–')].filter(Boolean).join(' · ')}</span></li>
                ))}
              </ul>
            ),
          },
        ]} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Frequent co-authors" subtitle="People who share two or more of these papers">
          <BarList rows={d.coAuthors.map((c) => ({ label: c.name, value: c.papers, text: `${c.papers} papers` }))} thing="frequent co-authors" />
        </ChartCard>
        <ChartCard title="Education and experience">
          {d.person.education.length === 0 ? <Empty thing="qualifications" /> : (
            <ul className="space-y-3">
              {d.person.education.map((e) => (
                <li key={e.level} className="text-sm">
                  <p className="font-medium text-ink">{e.degree} <span className="text-2xs font-normal text-ink-muted">({e.level})</span></p>
                  {e.institute ? <p className="text-2xs text-ink-muted">{e.institute}</p> : null}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t border-line pt-2 text-2xs text-ink-muted">
            {p.experienceMonths !== null ? <>Teaching experience: <span className="font-mono tabular-nums">{experienceOf(p)}</span></> : null}{p.experienceMonths !== null && p.joining ? ' · ' : ''}{p.joining ? <>Joined BIT {formatDate(p.joining)}</> : null}{p.experienceMonths === null && !p.joining ? 'Joining date not added yet.' : null}
          </p>
        </ChartCard>
      </div>
    </div>
  );
}
