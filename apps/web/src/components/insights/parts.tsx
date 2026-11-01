import Link from 'next/link';
import { Table, Th, Td } from '@/components/ui';
import { ChartCard } from '@/components/charts/ChartCard';
import { Donut } from '@/components/charts/Donut';
import { BarList } from '@/components/charts/BarList';
import { Empty } from '@/components/charts/Empty';
import { QUARTILE, num } from '@/components/charts/theme';
import { formatRupees } from '@darp/shared/format';
import type { CitationSummary, Insights, InsightCounts, InsightPaper, QuartileSplit } from '@darp/shared/contracts';

/** Pieces the person, department and college pages share. */

export const quartileSlices = (q: QuartileSplit) => [
  { name: 'Q1', value: q.q1, color: QUARTILE.q1 }, { name: 'Q2', value: q.q2, color: QUARTILE.q2 },
  { name: 'Q3', value: q.q3, color: QUARTILE.q3 }, { name: 'Q4', value: q.q4, color: QUARTILE.q4 },
  { name: 'No quartile', value: q.none, color: QUARTILE.none },
];
const quartileRows = (q: QuartileSplit): number[] => [q.q1, q.q2, q.q3, q.q4, q.none];

/** Papers, books, chapters, conference papers and patents filed, as a ring. */
export function OutputCard({ counts, title = 'What was produced' }: { counts: InsightCounts; title?: string }) {
  const output = [
    { name: 'Papers', value: counts.papers }, { name: 'Books', value: counts.books }, { name: 'Chapters', value: counts.chapters },
    { name: 'Conference papers', value: counts.conferencePapers }, { name: 'Patents filed', value: counts.patentsFiled },
  ];
  return (
    <ChartCard title={title} subtitle="Papers, books, chapters and patents" table={{ head: ['Kind', 'Count'], rows: output.map((o) => [o.name, o.value]) }}>
      <Donut slices={output} centre="outputs" thing="output" />
    </ChartCard>
  );
}

/** Papers by the journal's Impact Factor quartile and by SJR quartile. */
export function JournalQualityCard({ d }: { d: Pick<Insights, 'jif' | 'sjr'> }) {
  const names = ['Q1', 'Q2', 'Q3', 'Q4', 'No quartile'];
  const jif = quartileRows(d.jif); const sjr = quartileRows(d.sjr);
  return (
    <ChartCard title="Journal quality" subtitle="Papers by the journal’s Impact Factor quartile (JIF), then by SJR"
      table={{ head: ['Quartile', 'JIF', 'SJR'], rows: names.map((n, i) => [n, jif[i]!, sjr[i]!]) }}>
      <Donut slices={quartileSlices(d.jif)} centre="papers by JIF" size={132} thing="papers" />
      <div className="mt-4 border-t border-line pt-4">
        <Donut slices={quartileSlices(d.sjr)} centre="papers by SJR" size={132} thing="papers" />
      </div>
    </ChartCard>
  );
}

/** The h-index of a group, and where it comes from. */
export function HIndexCard({ c, title = 'Citations', scope }: { c: CitationSummary; title?: string; scope: string }) {
  return (
    <ChartCard title={title} subtitle={`Scopus citations of ${scope}’ papers, found by DOI`}
      table={{ head: ['Measure', 'Value'], rows: [['Citations', c.citations], ['h-index', c.hIndex], ['Papers found in Scopus', c.found], ['Not in Scopus', c.notInScopus], ['Not checked yet', c.notChecked], ['No DOI', c.noDoi]] }}>
      <div className="flex items-end gap-6">
        <div>
          <p className="font-mono text-4xl font-semibold tabular-nums text-ink">{num(c.hIndex)}</p>
          <p className="text-2xs text-ink-muted">h-index</p>
        </div>
        <div>
          <p className="font-mono text-2xl font-semibold tabular-nums text-ink">{num(c.citations)}</p>
          <p className="text-2xs text-ink-muted">citations</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        From <span className="font-mono tabular-nums">{num(c.found)}</span> papers found in Scopus.{' '}
        <span className="font-mono tabular-nums">{num(c.notInScopus)}</span> not in Scopus, <span className="font-mono tabular-nums">{num(c.notChecked)}</span> not checked yet,{' '}
        <span className="font-mono tabular-nums">{num(c.noDoi)}</span> with no DOI.
      </p>
      <p className="mt-1 text-2xs text-ink-faint">
        Counts {c.counts === 'all' ? 'all papers' : 'only papers done at BIT'}, as IQAC has set it. Differs from a person’s Scopus profile, which counts every paper from any institute.
      </p>
    </ChartCard>
  );
}

export function JournalsCard({ rows }: { rows: Insights['topJournals'] }) {
  return (
    <ChartCard title="Top journals" subtitle="Where the papers appear">
      <BarList rows={rows.map((j) => ({ label: j.journal, value: j.papers, text: `${j.papers} paper${j.papers === 1 ? '' : 's'}`, note: j.jif ? `Impact Factor ${j.jif}` : undefined }))} thing="journals" />
    </ChartCard>
  );
}

export function FundersCard({ rows }: { rows: Insights['funders'] }) {
  return (
    <ChartCard title="Funding agencies" subtitle="Who sanctioned the projects">
      <BarList rows={rows.map((f) => ({ label: f.agency, value: f.projects, text: f.amount > 0 ? `${f.projects} · ${formatRupees(f.amount)}` : `${f.projects}` }))} thing="funded projects" />
    </ChartCard>
  );
}

/** The newest papers as a table that scrolls sideways inside its card on a phone. */
export function RecentPapers({ papers, linkOwn = false }: { papers: InsightPaper[]; linkOwn?: boolean }) {
  if (papers.length === 0) return <Empty thing="publications" />;
  return (
    <div className="-mx-1 overflow-x-auto">
      <Table className="min-w-[42rem]">
        <thead>
          <tr><Th>Paper</Th><Th>Journal</Th><Th className="text-right">Year</Th><Th className="text-right">JIF</Th><Th>Quartile</Th><Th className="text-right">Citations</Th></tr>
        </thead>
        <tbody>
          {papers.map((r) => (
            <tr key={r.id}>
              <Td className="max-w-[28rem]">
                {linkOwn ? <Link href={`/m/publications/${r.id}`} className="font-medium text-primary hover:underline">{r.title || r.doi}</Link> : <span className="font-medium">{r.title || r.doi}</span>}
              </Td>
              <Td className="max-w-[16rem] text-ink-muted">{r.journal}</Td>
              <Td className="text-right font-mono tabular-nums">{r.year}</Td>
              <Td className="text-right font-mono tabular-nums">{r.jif ?? '—'}</Td>
              <Td>{r.quartile ?? '—'}</Td>
              <Td className="text-right font-mono tabular-nums">{r.citations ?? '—'}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

/** A plain white figure: a number over a small label. */
export function Stat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-sm ring-1 ring-line">
      <p className="font-mono text-2xl font-semibold tabular-nums text-ink">{typeof value === 'number' ? num(value) : value}</p>
      <p className="mt-1 text-xs text-ink-muted">{label}</p>
      {note ? <p className="text-2xs text-ink-faint">{note}</p> : null}
    </div>
  );
}
