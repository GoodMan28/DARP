import Link from 'next/link';
import { AppShell } from '@/components/shell/AppShell';
import {
  Card, CardHeader, Table, Th, Td, StatTile, Notice, EmptyState, LinkButton, StatePill,
} from '@/components/ui';
import { requireMe, loadPageData } from '@/lib/api.server';
import type { DashboardPayload, ModuleProgress } from '@darp/shared/contracts';
import { ROLE_PURPOSE, ROLE_LABEL } from '@darp/shared/roles';
import { formatDate, plural } from '@darp/shared/format';
import { modulesVerifiedBy } from '@darp/shared/modules';
import type { Role } from '@darp/shared/modules/types';

export const dynamic = 'force-dynamic';

/**
 * The role's purpose, plus the modules whose records are approved on submission: there the
 * verifying office's check is the last word and IQAC does not sign them off again.
 */
function purposeFor(role: Role): string {
  const final = modulesVerifiedBy(role).filter((m) => m.lookup?.autoApprove === 'always').map((m) => m.name);
  if (final.length === 0) return ROLE_PURPOSE[role];
  const names = final.length === 1 ? final[0] : `${final.slice(0, -1).join(', ')} and ${final[final.length - 1]}`;
  return `${ROLE_PURPOSE[role]} ${names} ${final.length === 1 ? 'is' : 'are'} approved on submission: you check ${final.length === 1 ? 'it' : 'them'} afterwards, and your verification is final.`;
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

export default async function DashboardPage() {
  const { user, cycle, groups } = await requireMe();
  const dashboard = await loadPageData<DashboardPayload>('/api/dashboard');
  if (!dashboard.ok) throw new Error(dashboard.message);

  const { ownsModules, modules: myModules, queue, departments } = dashboard.data;
  const showDepartments = user.role !== 'faculty';

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

  const awaitingMe = queue.reduce((n, q) => n + q.awaitingVerification, 0);
  const awaitingApproval = queue.reduce((n, q) => n + q.awaitingApproval, 0);

  return (
    <AppShell
      user={user}
      groups={groups}
      crumbs={[{ label: 'Overview' }]}
      title={`Good to see you, ${user.name}`}
      subtitle={purposeFor(user.role)}
      cycleName={cycle.name}
      actions={
        ownsModules && myModules[0]
          ? <LinkButton href={`/m/${myModules[0].key}`}>Continue data entry</LinkButton>
          : null
      }
    >
      {!cycle.id ? (
        <Notice tone="warning" title="No active reporting cycle" className="mb-4">
          IQAC has not opened a cycle yet. Records cannot be entered until one is active.
        </Notice>
      ) : null}

      {cycle.deadlineAt ? (
        <Notice tone="warning" className="mb-4">
          <strong>Data entry closes {formatDate(cycle.deadlineAt)}.</strong>{' '}
          Records still in draft after that date are not counted.
        </Notice>
      ) : null}

      {/* summary tiles */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ownsModules ? (
          <>
            <StatTile label="My records" value={totals.records} note={`${plural(myModules.length, 'module')} assigned`} />
            <StatTile label="Still with me" value={totals.drafts} note="Draft or returned" />
            <StatTile label="Awaiting verification" value={totals.submitted} note="With the dean’s office" />
            <StatTile label="Approved by IQAC" value={totals.approved} note={`${pct}% of my modules complete`} />
          </>
        ) : (
          <>
            <StatTile label="Awaiting my verification" value={awaitingMe} note="Submitted records" />
            <StatTile label="Awaiting IQAC approval" value={awaitingApproval} note="Verified records" />
            <StatTile label="Departments" value={departments.length} note="Reporting this cycle" />
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

      <div className="grid gap-4 lg:grid-cols-3">
        {/* my modules */}
        {ownsModules ? (
          <Card className="lg:col-span-2" padded={false}>
            <CardHeader
              title="My modules"
              subtitle="Everything your role is responsible for this cycle."
            />
            {myModules.length === 0 ? (
              <EmptyState title="No modules assigned">
                Your role does not own any data modules. Use the verification queue instead.
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
        ) : null}

        {/* verification queue */}
        {queue.length > 0 ? (
          <Card className={ownsModules ? '' : 'lg:col-span-2'} padded={false}>
            <CardHeader
              title="Verification queue"
              subtitle={`What ${ROLE_LABEL[user.role].split(' —')[0]} still has to act on.`}
            />
            {awaitingMe + awaitingApproval === 0 ? (
              <EmptyState title="Nothing waiting">Every submitted record has been dealt with.</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Module</Th>
                    <Th className="w-24 text-right">To verify</Th>
                    <Th className="w-28 text-right">To approve</Th>
                  </tr>
                </thead>
                <tbody>
                  {queue
                    .filter((q) => q.awaitingVerification + q.awaitingApproval > 0)
                    .map((q) => (
                      <tr key={q.moduleKey} className="hover:bg-surface-2">
                        <Td>
                          <Link
                            href={`/m/${q.moduleKey}?status=submitted`}
                            className="font-medium text-primary hover:underline"
                          >
                            {q.name}
                          </Link>
                        </Td>
                        <Td className="text-right font-mono tabular-nums">
                          {q.awaitingVerification || '—'}
                        </Td>
                        <Td className="text-right font-mono tabular-nums">
                          {q.awaitingApproval || '—'}
                        </Td>
                      </tr>
                    ))}
                </tbody>
              </Table>
            )}
          </Card>
        ) : null}

        {/* profile shortcut for faculty */}
        {user.role === 'faculty' ? (
          <Card padded={false}>
            <CardHeader title="My profile" subtitle="Computed from your records." />
            <div className="p-4 text-sm text-ink-muted">
              <p>
                Your profile carries 22 typed fields, 49 counters computed from the records above,
                and 13 figures you declare yourself.
              </p>
              <div className="mt-3">
                <LinkButton href="/profile" variant="secondary">Open my profile</LinkButton>
              </div>
            </div>
          </Card>
        ) : null}
      </div>

      {/* department completion */}
      {showDepartments && departments.length > 0 ? (
        <Card className="mt-4" padded={false}>
          <CardHeader
            title={user.role === 'hod' ? 'My department' : 'Completion by department'}
            subtitle="Aggregates only — no record contents are shown here."
          />
          <Table>
            <thead>
              <tr>
                <Th>Department</Th>
                <Th className="w-24 text-right">Faculty</Th>
                <Th className="w-28 text-right">Reporting</Th>
                <Th className="w-24 text-right">Records</Th>
                <Th className="w-40">Modules covered</Th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.departmentId} className="hover:bg-surface-2">
                  <Td>
                    <span className="font-medium">{d.department}</span>
                    <span className="ml-1.5 font-mono text-2xs text-ink-faint">{d.departmentCode}</span>
                  </Td>
                  <Td className="text-right font-mono tabular-nums">{d.facultyTotal}</Td>
                  <Td className="text-right font-mono tabular-nums">{d.facultyReporting}</Td>
                  <Td className="text-right font-mono tabular-nums">{d.records}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-xs bg-surface-inset">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.min(d.pct, 100)}%` }}
                        />
                      </div>
                      <span className="font-mono text-2xs tabular-nums text-ink-muted">
                        {d.modulesComplete}/{d.modulesApplicable}
                      </span>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {/* legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-2xs text-ink-muted">
        <span className="font-semibold uppercase tracking-wider text-ink-faint">Record lifecycle</span>
        <StatePill status="draft" />
        <span aria-hidden="true">→</span>
        <StatePill status="submitted" />
        <span aria-hidden="true">→</span>
        <StatePill status="verified" />
        <span aria-hidden="true">→</span>
        <StatePill status="approved" />
        <span className="ml-2">A returned record comes back to its owner with a remark.</span>
      </div>
    </AppShell>
  );
}
