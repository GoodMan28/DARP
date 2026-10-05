import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/api.server';
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
  const { user, capabilities, cycle, groups } = await requireMe();

  // The page is a convenience; every route it calls re-checks the capability server-side.
  if (user.role !== 'admin' || !capabilities.manageUsers) redirect('/dashboard');

  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const initialTab: AdminTab = isAdminTab(raw) ? raw : 'accounts';

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
