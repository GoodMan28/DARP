import { redirect } from 'next/navigation';
import { requireUser, getActiveCycle, getSidebarGroups } from '@/server/page-data';
import { hasCapability } from '@/server/auth/permissions';
import { AppShell } from '@/components/shell/AppShell';
import { AdminConsole } from '@/components/admin/AdminConsole';
import { isAdminTab, type AdminTab } from '@/components/admin/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Administration · DARP',
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  // The page is a convenience; every route it calls re-checks the capability server-side.
  if (user.role !== 'admin' || !hasCapability(user, 'manageUsers')) redirect('/dashboard');

  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const initialTab: AdminTab = isAdminTab(raw) ? raw : 'accounts';

  const cycle = await getActiveCycle();
  const groups = await getSidebarGroups(user, cycle.id);

  return (
    <AppShell
      user={user}
      groups={groups}
      crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Administration' }]}
      title="Administration"
      subtitle="Accounts, the master lists every dropdown reads, the reporting cycle, the audit trail and the six workbook exports."
      cycleName={cycle.name}
    >
      <AdminConsole initialTab={initialTab} currentUserId={user.id} />
    </AppShell>
  );
}
