import { Hero } from '@/components/charts/Hero';
import { HeroTile } from '@/components/charts/HeroTile';
import { ChartCard } from '@/components/charts/ChartCard';
import { BarsByYear } from '@/components/charts/BarsByYear';
import { Trend } from '@/components/charts/Trend';
import { BarList } from '@/components/charts/BarList';
import { RangePicker } from '@/components/charts/RangePicker';
import { formatRupees } from '@darp/shared/format';
import type { CollegeInsights, DepartmentCompletionRow } from '@darp/shared/contracts';
import { Tabs } from './Tabs';
import { CompletionTable } from './CompletionTable';
import { DepartmentTable, DepartmentTiles, TopResearchers } from './CollegeParts';
import { FundersCard, HIndexCard, JournalQualityCard, JournalsCard, OutputCard, Stat } from './parts';

/** The whole college: for the deans and IQAC. There is no list of researchers by designation here, by IQAC's choice. */
export function CollegeView({ data: d, completion, minYear, maxYear }: {
  data: CollegeInsights; completion: DepartmentCompletionRow[]; minYear: number; maxYear: number;
}) {
  const c = d.counts;
  const papers = d.byYear.map((y) => ({ year: y.year, value: y.papers }));
  const funding = d.byYear.map((y) => ({ year: y.year, value: y.funding }));
  const by = (pick: (x: CollegeInsights['departments'][number]) => number) => d.departments.map((x) => ({ label: x.name, value: pick(x), href: `/department/${encodeURIComponent(x.code)}` })).sort((a, b) => b.value - a.value).slice(0, 8);

  return (
    <div className="space-y-4">
      <Hero title="Birla Institute of Technology, Mesra" subtitle="Every department, as counted in DARP" columns={6}>
        <HeroTile label="Faculty" value={d.facultyTotal} note={`${d.reporting} reporting`} />
        <HeroTile label="Departments" value={d.departmentCount} />
        <HeroTile label="Publications" value={c.papers} />
        <HeroTile label="Scopus citations" value={d.citations.citations} note="of these papers" />
        <HeroTile label="h-index" value={d.citations.hIndex} note="of these papers" />
        <HeroTile label="Patents filed" value={c.patentsFiled} />
      </Hero>

      <RangePicker minYear={minYear} maxYear={maxYear} />

      <Tabs label="College" tabs={[
        {
          id: 'overview', label: 'Overview',
          content: (
            <div className="space-y-4">
              <ChartCard title="Publications by year" subtitle="Papers counted, by year of publication" table={{ head: ['Year', 'Papers'], rows: papers.map((p) => [String(p.year), p.value]) }}>
                <BarsByYear data={papers} name="Papers" thing="papers" />
              </ChartCard>
              <div className="grid gap-4 lg:grid-cols-3">
                <OutputCard counts={c} title="Composition of output" />
                <JournalQualityCard d={d} />
                <HIndexCard c={d.citations} scope="the college’s" />
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Patents filed" value={c.patentsFiled} />
                <Stat label="Patents published" value={c.patentsPublished} />
                <Stat label="Patents granted" value={c.patentsGranted} />
                <Stat label="Projects" value={c.projects} note={c.projectFunding > 0 ? `${formatRupees(c.projectFunding)} sanctioned` : undefined} />
              </div>
              <ChartCard title="Projects and funding" subtitle="Sanctioned amount of projects, by year" table={{ head: ['Year', 'Rupees'], rows: funding.map((f) => [String(f.year), f.value]) }}>
                <Trend data={funding} name="Funding" thing="funding" />
              </ChartCard>
              <div className="grid gap-4 lg:grid-cols-2">
                <JournalsCard rows={d.topJournals} />
                <FundersCard rows={d.funders} />
              </div>
            </div>
          ),
        },
        {
          id: 'departments', label: 'Departments', count: d.departments.length,
          content: (
            <div className="space-y-4">
              <DepartmentTiles rows={d.departments} />
              <div className="grid gap-4 lg:grid-cols-3">
                <ChartCard title="Publications" subtitle="By department"><BarList rows={by((x) => x.papers)} thing="publications" /></ChartCard>
                <ChartCard title="Scopus citations" subtitle="By department"><BarList rows={by((x) => x.citations)} thing="citations" /></ChartCard>
                <ChartCard title="h-index" subtitle="By department"><BarList rows={by((x) => x.hIndex)} thing="h-indexes" /></ChartCard>
              </div>
              <DepartmentTable rows={d.departments} />
            </div>
          ),
        },
        { id: 'researchers', label: 'Researchers', content: <TopResearchers byPapers={d.topByPapers} byCitations={d.topByCitations} /> },
        { id: 'completion', label: 'Data completion', content: <CompletionTable rows={completion} /> },
      ]} />
    </div>
  );
}
