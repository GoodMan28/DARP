import Link from 'next/link';
import { AppShell } from '@/components/shell/AppShell';
import {
  Card, CardHeader, Table, Th, Td, StatTile, EmptyState, LinkButton,
} from '@/components/ui';
import { CorrectionActions } from '@/components/records/CorrectionActions';
import { requireMe, loadPageData } from '@/lib/api.server';
import type { DashboardPayload, ModuleProgress, PersonInsights } from '@darp/shared/contracts';
import { PersonStats } from '@/components/insights/PersonStats';
import { CompletionTable } from '@/components/insights/CompletionTable';
import { canSeeCollege } from '@darp/shared/insights';
import { rangeFrom, rangeQuery, yearBounds } from '@/lib/insights';
import { ROLE_PURPOSE } from '@darp/shared/roles';
import { plural } from '@darp/shared/format';
import type { Role } from '@darp/shared/modules/types';
import { getModule } from '@darp/shared/modules';
import { MyNumbers } from './MyNumbers';

export const dynamic = 'force-dynamic';

/** The role's purpose; every record is approved when its owner submits it, and checked afterwards. */
function purposeFor(role: Role): string {
  return ROLE_PURPOSE[role];
}

const PROGRESS_LABEL: Record<ModuleProgress, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  verified: 'Verified',
  approved: 'Approved',
};

const PROGRESS_CLASS: Record<ModuleProgress, string> = {
  not_started: 'bg-surface-inset text-ink-muted border-line-strong',
  in_progress: 'bg-warning-50 text-warning-700 border-warning-100',
  submitted: 'bg-info-50 text-info-700 border-info-100',
  verified: 'bg-violet-50 text-violet-700 border-violet-100',
  approved: 'bg-success-50 text-success-700 border-success-100',
};

function ProgressPill({ progress }: { progress: ModuleProgress }) {
  return (
    <span
      className={`inline-flex items-center rounded-xs border px-1.5 py-0.5 text-2xs font-semibold ${PROGRESS_CLASS[progress]}`}
    >
      {PROGRESS_LABEL[progress]}
    </span>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { user, groups } = await requireMe();
  const dashboard = await loadPageData<DashboardPayload>('/api/dashboard');
  if (!dashboard.ok) throw new Error(dashboard.message);

  const { ownsModules, modules: myModules, departments, corrections, autoUpdates } = dashboard.data;
  const showDepartments = user.role === 'cdc';
  // Everyone who fills in a Faculty Profile (faculty, HODs, professors holding an office) has numbers.
  const fillsProfile = !!getModule('profile')?.ownerRoles.includes(user.role);
  // A person who fills a profile gets their own page: figures, charts and what to do next.
  const range = rangeFrom(await searchParams);
  const insights = fillsProfile ? await loadPageData<PersonInsights>(`/api/insights/me${rangeQuery(range)}`) : null;
  if (insights && !insights.ok) throw new Error(insights.message);

  const totals = myModules.reduce(
    (acc, m) => ({
      records: acc.records + m.total,
      drafts: acc.drafts + m.drafts,
      submitted: acc.submitted + m.submitted,
      verified: acc.verified + m.verified,
      approved: acc.approved + m.approved,
    }),
    { records: 0, drafts: 0, submitted: 0, verified: 0, approved: 0 },
  );

  const complete = myModules.filter(
    (m) => m.progress !== 'not_started' && m.progress !== 'in_progress',
  ).length;
  const pct = myModules.length ? Math.round((complete / myModules.length) * 100) : 0;


  return (
    <AppShell
      user={user}
      groups={groups}
      crumbs={[{ label: 'Overview' }]}
      title={`Good to see you, ${user.name}`}
      subtitle={purposeFor(user.role)}
      actions={
        ownsModules && myModules[0]
          ? <LinkButton href={`/m/${myModules[0].key}`}>Continue data entry</LinkButton>
          : null
      }
    >
      {canSeeCollege(user.role) ? (
        <p className="mb-4 text-sm"><Link href="/college" className="font-semibold text-maroon-700 hover:underline">College overview</Link><span className="text-ink-muted"> · every department, its people and figures</span></p>
      ) : null}

      {insights?.ok ? (
        <div className="mb-4">
          <PersonStats data={insights.data} own {...yearBounds(insights.data.byYear, range)} />
        </div>
      ) : null}

      {/* summary tiles */}
      <div className={`mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${fillsProfile ? 'hidden' : ''}`}>
        {ownsModules ? (
          <>
            <StatTile label="My records" value={totals.records} note={`${plural(myModules.length, 'module')} assigned`} />
            <StatTile label="Still with me" value={totals.drafts} note="Draft or returned" />
            <StatTile label="Approved" value={totals.approved} note={`${pct}% of my modules complete`} />
          </>
        ) : (
          <>
            <StatTile label="Corrected after return" value={corrections.length} note="Waiting for your second look" />
            <StatTile label="Departments" value={departments.length} note="Reporting" />
            <StatTile
              label="Institute completion"
              value={`${departments.length
                ? Math.round(departments.reduce((n, d) => n + d.pct, 0) / departments.length)
                : 0}%`}
              note="Average across departments"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        {/* my modules: folded away for people whose Overview is their own page */}
        {ownsModules ? (
          fillsProfile ? (
            <details className="rounded-lg bg-surface shadow-sm ring-1 ring-line lg:col-span-3">
              <summary className="cursor-pointer select-none px-5 py-3">
                <h2 className="inline text-sm font-semibold text-ink">My modules</h2>
                <span className="ml-2 text-xs text-ink-muted">{plural(myModules.length, 'module')} · {pct}% complete</span>
              </summary>
          <div>
                        {myModules.length === 0 ? (
              <EmptyState title="No modules assigned">
                Your role does not own any data modules. Records are approved when their owners submit them; open a module to check them.
              </EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Module</Th>
                    <Th className="w-20 text-right">Records</Th>
                    <Th className="w-24 text-right">With me</Th>
                    <Th className="w-28">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {myModules.map((m) => (
                    <tr key={m.key} className="hover:bg-surface-2">
                      <Td>
                        <Link href={`/m/${m.key}`} className="font-medium text-primary hover:underline">
                          {m.name}
                        </Link>
                        <div className="text-2xs text-ink-faint">
                          {m.group} · {m.periodType}
                          {m.declaredNil ? ' · nothing to report' : ''}
                        </div>
                      </Td>
                      <Td className="text-right font-mono tabular-nums">{m.total}</Td>
                      <Td className="text-right font-mono tabular-nums">
                        {m.drafts > 0 ? <span className="font-semibold text-warning-700">{m.drafts}</span> : '—'}
                      </Td>
                      <Td><ProgressPill progress={m.progress} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
            </details>
          ) : (
          <Card className="lg:col-span-2" padded={false}>
            <CardHeader
              title="My modules"
              subtitle="Everything your role is responsible for."
            />
            {myModules.length === 0 ? (
              <EmptyState title="No modules assigned">
                Your role does not own any data modules. Records are approved when their owners submit them; open a module to check them.
              </EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Module</Th>
                    <Th className="w-20 text-right">Records</Th>
                    <Th className="w-24 text-right">With me</Th>
                    <Th className="w-28">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {myModules.map((m) => (
                    <tr key={m.key} className="hover:bg-surface-2">
                      <Td>
                        <Link href={`/m/${m.key}`} className="font-medium text-primary hover:underline">
                          {m.name}
                        </Link>
                        <div className="text-2xs text-ink-faint">
                          {m.group} · {m.periodType}
                          {m.declaredNil ? ' · nothing to report' : ''}
                        </div>
                      </Td>
                      <Td className="text-right font-mono tabular-nums">{m.total}</Td>
                      <Td className="text-right font-mono tabular-nums">
                        {m.drafts > 0 ? <span className="font-semibold text-warning-700">{m.drafts}</span> : '—'}
                      </Td>
                      <Td><ProgressPill progress={m.progress} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          )
        ) : null}

        {/* corrections waiting for a second look */}
        {corrections.length > 0 ? (
          <Card className="lg:col-span-3" padded={false}>
            <CardHeader
              title="Corrected after you returned them"
              subtitle="They are already approved. Look at what changed, then mark it checked or return it again."
            />
            <Table>
              <thead>
                <tr><Th>Record</Th><Th>What changed</Th><Th>Owner</Th><Th className="text-right">&nbsp;</Th></tr>
              </thead>
              <tbody>
                {corrections.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2">
                    <Td>
                      <Link href={`/m/${c.moduleKey}/${c.id}`} className="font-medium text-primary hover:underline">{c.title}</Link>
                      <span className="block text-xs text-ink-muted">{c.moduleName}</span>
                    </Td>
                    <Td>
                      {c.changed.length > 0 ? (
                        <>
                          {c.changed.slice(0, 4).join(', ')}{c.changed.length > 4 ? ` and ${c.changed.length - 4} more` : ''}{' '}
                          <Link href={`/m/${c.moduleKey}/${c.id}#edit-history`} className="font-semibold text-primary underline">See changes</Link>
                        </>
                      ) : (
                        <span className="rounded-sm border border-warning-100 bg-warning-50 px-1.5 py-0.5 text-xs font-semibold text-warning-700">
                          Resubmitted without changes
                        </span>
                      )}
                    </Td>
                    <Td>{c.ownerName}</Td>
                    <Td className="text-right"><CorrectionActions moduleKey={c.moduleKey} recordId={c.id} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}

        {/* patents the Patent Office Journal moved forward */}
        {autoUpdates.length > 0 ? (
          <Card className={ownsModules ? 'lg:col-span-3' : 'lg:col-span-2'} padded={false}>
            <CardHeader
              title="Updated automatically (last 30 days)"
              subtitle="The Patent Office Journal moved these patents forward. You do not need to do anything."
            />
            <ul className="divide-y divide-line text-sm">
              {autoUpdates.map((u) => (
                <li key={`${u.id}-${u.at}`} className="px-4 py-2.5">
                  <Link href={`/m/${u.moduleKey}/${u.id}#edit-history`} className="font-medium text-primary hover:underline">{u.text}</Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* profile shortcut for faculty */}
        {fillsProfile ? (
          <Card padded={false}>
            <CardHeader title="My profile" subtitle="Your details: designation, qualifications, identifiers." />
            <div className="p-4">
              <LinkButton href="/profile" variant="secondary">Open my profile</LinkButton>
            </div>
          </Card>
        ) : null}
      </div>

      {/* the person's own totals, only when asked for */}
      {fillsProfile ? (
        <div className="mt-4"><MyNumbers /></div>
      ) : null}

      {/* how far each department has got: CDC's only view of it; the deans and IQAC find it on the College page, a head on the department page */}
      {showDepartments && departments.length > 0 ? <div className="mt-4"><CompletionTable rows={departments} /></div> : null}
    </AppShell>
  );
}
