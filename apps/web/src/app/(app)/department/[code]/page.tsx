import { AppShell } from '@/components/shell/AppShell';
import { DepartmentView } from '@/components/insights/DepartmentView';
import { requireMe, loadPageData } from '@/lib/api.server';
import { rangeFrom, rangeQuery, yearBounds } from '@/lib/insights';
import { canSeeCollege } from '@darp/shared/insights';
import type { DepartmentInsights } from '@darp/shared/contracts';

export const dynamic = 'force-dynamic';

/** Any department: the deans and IQAC, or a person's own department. The server decides; a refusal reads as "not found". */
export default async function DepartmentPage({ params, searchParams }: {
  params: Promise<{ code: string }>; searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { user, groups } = await requireMe();
  const { code } = await params;
  const range = rangeFrom(await searchParams);
  const data = await loadPageData<DepartmentInsights>(`/api/insights/department/${encodeURIComponent(code)}${rangeQuery(range)}`);
  if (!data.ok) throw new Error(data.message);
  const crumbs = canSeeCollege(user.role)
    ? [{ label: 'Overview', href: '/dashboard' }, { label: 'College', href: '/college' }, { label: data.data.department.code }]
    : [{ label: 'Overview', href: '/dashboard' }, { label: data.data.department.code }];
  return (
    <AppShell user={user} groups={groups} crumbs={crumbs} title={data.data.department.name} subtitle="Publications, citations, people and projects of the department, as counted in DARP">
      <DepartmentView data={data.data} {...yearBounds(data.data.byYear, range)} />
    </AppShell>
  );
}
