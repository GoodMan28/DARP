import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/api.server';
import { AppShell } from '@/components/shell/AppShell';
import { ReportsPanel } from '@/components/reports/ReportsPanel';
import { ResearchQualityPanel } from '@/components/research/ResearchQualityPanel';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Reports · DARP' };

/**
 * Reports by year range for every level (a faculty member's own records, a HOD's department, the
 * offices' and IQAC's), and, for IQAC, DRIE and heads of department, the research-quality table.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { user, capabilities, groups } = await requireMe();
  // A convenience only: every report route checks the capability again.
  if (!capabilities.export) redirect('/dashboard');
  const mayQuality = ['admin', 'drie', 'hod'].includes(user.role);
  const view = mayQuality && (await searchParams).view === 'quality' ? 'quality' : 'downloads';
  const tab = (key: string, label: string) => (
    <a
      href={key === 'downloads' ? '/reports' : `/reports?view=${key}`}
      aria-current={view === key ? 'page' : undefined}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold no-underline ${view === key ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink'}`}
    >
      {label}
    </a>
  );
  return (
    <AppShell
      user={user}
      groups={groups}
      crumbs={[{ label: 'Overview', href: '/dashboard' }, { label: 'Reports' }]}
      title="Reports"
      subtitle={user.role === 'faculty'
        ? 'Download your own records for any span of years, in the Faculty format or as full data.'
        : user.role === 'hod'
          ? 'Download your department’s records for any span of years, in the original formats or as full data.'
          : 'Download the records for any span of years, in the original formats or as full data.'}
    >
      {mayQuality ? (
        <nav aria-label="Reports" className="mb-4 flex gap-1 border-b border-line">
          {tab('downloads', 'Downloads')}
          {tab('quality', 'Research quality')}
        </nav>
      ) : null}
      {view === 'quality' ? <ResearchQualityPanel isAdmin={user.role === 'admin'} /> : <ReportsPanel />}
    </AppShell>
  );
}
