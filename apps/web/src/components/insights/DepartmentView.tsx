import { Hero } from '@/components/charts/Hero';
import { HeroTile } from '@/components/charts/HeroTile';
import { ChartCard } from '@/components/charts/ChartCard';
import { BarsByYear } from '@/components/charts/BarsByYear';
import { Trend } from '@/components/charts/Trend';
import { BarList } from '@/components/charts/BarList';
import { RangePicker } from '@/components/charts/RangePicker';
import { formatRupees } from '@darp/shared/format';
import type { DepartmentInsights } from '@darp/shared/contracts';
import { Tabs } from './Tabs';
import { FacultyGrid } from './FacultyGrid';
import { FundersCard, HIndexCard, JournalQualityCard, JournalsCard, OutputCard, RecentPapers, Stat } from './parts';

/** A department's page, for its own faculty and head, and for the deans and IQAC. */
export function DepartmentView({ data: d, minYear, maxYear }: { data: DepartmentInsights; minYear: number; maxYear: number }) {
  const papers = d.byYear.map((y) => ({ year: y.year, value: y.papers }));
  const funding = d.byYear.map((y) => ({ year: y.year, value: y.funding }));
  const c = d.counts;

  return (
    <div className="space-y-4">
      <Hero
        title={d.department.name}
        subtitle="Birla Institute of Technology, Mesra"
        chips={[`${d.facultyTotal} faculty`, `${d.reporting} reporting`, d.department.code]}
        aside={(
          <div className="rounded-lg bg-surface p-4 text-ink shadow-md">
            <h3 className="mb-1 text-sm font-semibold">Publications by year</h3>
            <BarsByYear data={papers} name="Papers" height={150} thing="papers" />
          </div>
        )}
      >
        <HeroTile label="Publications" value={c.papers} />
        <HeroTile label="Scopus citations" value={d.citations.citations} note="of these papers" />
        <HeroTile label="h-index" value={d.citations.hIndex} note="of these papers" />
        <HeroTile label="Patents filed" value={c.patentsFiled} />
      </Hero>

      <RangePicker minYear={minYear} maxYear={maxYear} />

      <Tabs label="Department" tabs={[
        {
          id: 'overview', label: 'Overview',
          content: (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <OutputCard counts={c} title="What the department published" />
                <JournalQualityCard d={d} />
                <HIndexCard c={d.citations} scope="the department’s" />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <JournalsCard rows={d.topJournals} />
                <FundersCard rows={d.funders} />
                <ChartCard title="Designations" subtitle="Faculty by designation">
                  <BarList rows={d.designations.map((x) => ({ label: x.designation, value: x.people }))} thing="designations" />
                </ChartCard>
              </div>
            </div>
          ),
        },
        { id: 'faculty', label: 'Faculty', content: <FacultyGrid people={d.faculty} /> },
        {
          id: 'research', label: 'Research',
          content: (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Stat label="Patents filed" value={c.patentsFiled} />
                <Stat label="Patents published" value={c.patentsPublished} />
                <Stat label="Patents granted" value={c.patentsGranted} />
                <Stat label="Projects" value={c.projects} note={c.projectFunding > 0 ? `${formatRupees(c.projectFunding)} sanctioned` : undefined} />
                <Stat label="Consultancy revenue" value={formatRupees(c.consultancyRevenue)} />
              </div>
              <ChartCard title="Funding by year" subtitle="Sanctioned amount of projects, by year" table={{ head: ['Year', 'Rupees'], rows: funding.map((f) => [String(f.year), f.value]) }}>
                <Trend data={funding} name="Funding" thing="funding" />
              </ChartCard>
              <ChartCard title="Recent publications" subtitle="The eight newest counted papers"><RecentPapers papers={d.recentPapers} /></ChartCard>
            </div>
          ),
        },
        {
          id: 'students', label: 'Students and teaching',
          content: (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label="UG students guided" value={c.studentsUg} />
              <Stat label="PG students guided" value={c.studentsPg} />
              <Stat label="Ph.D. students guided" value={c.studentsPhd} />
              <Stat label="FDPs attended" value={c.fdps} />
              <Stat label="E-content modules" value={c.econtent} />
              <Stat label="Outreach activities" value={c.outreach} />
            </div>
          ),
        },
      ]} />
    </div>
  );
}
