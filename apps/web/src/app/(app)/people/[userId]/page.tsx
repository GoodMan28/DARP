import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { PersonStats } from '@/components/insights/PersonStats';
import { requireMe, loadPageData } from '@/lib/api.server';
import { rangeFrom, rangeQuery, yearBounds } from '@/lib/insights';
import type { PersonInsights } from '@darp/shared/contracts';

export const dynamic = 'force-dynamic';

/**
 * Someone else's page: a colleague in the same department, or anyone for a dean or IQAC. The server decides who may
 * open it; a refusal reads as "not found" so nothing shows that the person exists.
 */
export default async function PersonPage({ params, searchParams }: {
  params: Promise<{ userId: string }>; searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { user, groups } = await requireMe();
  const { userId } = await params;
  const range = rangeFrom(await searchParams);
  // Not a uuid: the same page as for a person who may not be seen.
  const data = /^[0-9a-f-]{36}$/i.test(userId) ? await loadPageData<PersonInsights>(`/api/insights/person/${userId}${rangeQuery(range)}`) : null;
  if (!data) notFound();
  if (!data.ok) throw new Error(data.message);
  return (
    <AppShell user={user} groups={groups} crumbs={[{ label: 'Overview', href: '/dashboard' }, { label: data.data.person.name }]} title={data.data.person.name} subtitle="Publications, projects and other work, as counted in DARP">
      <PersonStats data={data.data} own={data.data.person.userId === user.id} {...yearBounds(data.data.byYear, range)} />
    </AppShell>
  );
}
