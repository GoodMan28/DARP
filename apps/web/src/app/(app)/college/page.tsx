import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { CollegeView } from '@/components/insights/CollegeView';
import { requireMe, loadPageData } from '@/lib/api.server';
import { rangeFrom, rangeQuery, yearBounds } from '@/lib/insights';
import { canSeeCollege } from '@darp/shared/insights';
import type { CollegeInsights, DashboardPayload } from '@darp/shared/contracts';

export const dynamic = 'force-dynamic';

/** The whole college, for the deans and IQAC; everyone else goes to their own Overview. */
export default async function CollegePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { user, groups } = await requireMe();
  if (!canSeeCollege(user.role)) redirect('/dashboard');
  const range = rangeFrom(await searchParams);
  const [data, dashboard] = await Promise.all([
    loadPageData<CollegeInsights>(`/api/insights/college${rangeQuery(range)}`),
    loadPageData<DashboardPayload>('/api/dashboard'),
  ]);
  if (!data.ok) throw new Error(data.message);
  if (!dashboard.ok) throw new Error(dashboard.message);
  return (
    <AppShell user={user} groups={groups} crumbs={[{ label: 'Overview', href: '/dashboard' }, { label: 'College' }]} title="College" subtitle="Every department: publications, citations, people, projects and how far data entry has got">
      <CollegeView data={data.data} completion={dashboard.data.departments} {...yearBounds(data.data.byYear, range)} />
    </AppShell>
  );
}
