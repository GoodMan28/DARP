import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { DepartmentView } from '@/components/insights/DepartmentView';
import { requireMe, loadPageData } from '@/lib/api.server';
import { rangeFrom, rangeQuery, yearBounds } from '@/lib/insights';
import { canSeeCollege } from '@darp/shared/insights';
import type { DashboardPayload, DepartmentInsights } from '@darp/shared/contracts';

export const dynamic = 'force-dynamic';

/** The signed-in person's own department. */
export default async function MyDepartmentPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { user, groups } = await requireMe();
  if (!user.departmentCode || (user.role !== 'faculty' && user.role !== 'hod')) redirect(canSeeCollege(user.role) ? '/college' : '/dashboard');
  const range = rangeFrom(await searchParams);
  const data = await loadPageData<DepartmentInsights>(`/api/insights/department/${encodeURIComponent(user.departmentCode)}${rangeQuery(range)}`);
  if (!data.ok) throw new Error(data.message);
  // A head also sees how far their department's data entry has got.
  const dashboard = user.role === 'hod' ? await loadPageData<DashboardPayload>('/api/dashboard') : null;
  const completion = dashboard?.ok ? dashboard.data.departments.find((r) => r.departmentCode === user.departmentCode) ?? null : null;
  return (
    <AppShell user={user} groups={groups} crumbs={[{ label: 'Overview', href: '/dashboard' }, { label: 'My department' }]} title="My department" subtitle="Publications, citations, people and projects of your department, as counted in DARP">
      <DepartmentView data={data.data} completion={completion} {...yearBounds(data.data.byYear, range)} />
    </AppShell>
  );
}
