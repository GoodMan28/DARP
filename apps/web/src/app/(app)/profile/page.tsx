import Link from 'next/link';
import { AppShell } from '@/components/shell/AppShell';
import { Card, CardHeader, StatTile, Notice, LinkButton, Table, Th, Td, StatePill } from '@/components/ui';
import { requireMe, apiGet, loadPageData } from '@/lib/api.server';
import type { CounterValues, RecordListPayload } from '@darp/shared/contracts';
import { getModule } from '@darp/shared/modules';
import { formatRupees, displayValue, formatDate } from '@darp/shared/format';
import { DeclaredCounters } from './DeclaredCounters';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My profile · DARP' };

export default async function ProfilePage() {
  const { user, cycle, groups } = await requireMe();
  const profileModule = getModule('profile');

  let counters: CounterValues = { userId: user.id, computed: [], declared: [] };
  if (cycle.id) {
    const r = await loadPageData<CounterValues>('/api/profile/rollups');
    if (!r.ok) throw new Error(r.message);
    counters = r.data;
  }

  // The Faculty Profile is a record like any other: one per user per cycle. Office roles
  // that cannot open the profile module simply have none, so a refusal here is not an error.
  const profileList = cycle.id && profileModule
    ? await apiGet<RecordListPayload>('/api/modules/profile/records?pageSize=1')
    : null;
  if (profileList && !profileList.ok && profileList.error.code !== 'FORBIDDEN') {
    throw new Error(`GET profile records failed: ${profileList.error.code}`);
  }
  const profileRecord = profileList?.ok ? profileList.data.rows[0] ?? null : null;

  const byModule = new Map<string, typeof counters.computed>();
  for (const c of counters.computed) {
    const list = byModule.get(c.moduleName) ?? [];
    list.push(c);
    byModule.set(c.moduleName, list);
  }

  return (
    <AppShell
      user={user}
      groups={groups}
      crumbs={[{ label: 'Overview', href: '/dashboard' }, { label: 'My profile' }]}
      title="My profile"
      subtitle="Twenty-two typed fields, forty-nine counters computed from your records, and thirteen figures you declare yourself."
      cycleName={cycle.name}
      actions={
        <LinkButton href={profileRecord ? `/m/profile/${profileRecord.id}` : '/m/profile/new'}>
          {profileRecord ? 'Edit my details' : 'Complete my details'}
        </LinkButton>
      }
    >
      {!profileRecord ? (
        <Notice tone="warning" title="Your profile details are not filled in yet" className="mb-4">
          The faculty annexure needs your designation, qualifications, experience and identifiers.
          Everything else on this page is computed for you.
        </Notice>
      ) : null}

      {/* typed fields */}
      {profileRecord && profileModule ? (
        <Card className="mb-4" padded={false}>
          <CardHeader
            title="My details"
            subtitle="Typed by you. Aadhaar and PAN are stored encrypted and always shown masked."
            actions={<StatePill status={profileRecord.status} />}
          />
          <div className="grid gap-x-8 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {profileModule.fields
              .filter((f) => f.type !== 'file')
              .map((f) => (
                <div key={f.key} className="min-w-0">
                  <div className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                    {f.label}
                  </div>
                  <div className="truncate text-sm text-ink">
                    {displayValue(profileRecord.data[f.key], f.type)}
                  </div>
                </div>
              ))}
          </div>
          <p className="border-t border-line px-4 py-2.5 text-2xs text-ink-muted">
            Last updated {formatDate(profileRecord.updatedAt)} · Department and joining date come from
            your account and can only be changed by IQAC.
          </p>
        </Card>
      ) : null}

      {/* computed counters */}
      <Card className="mb-4" padded={false}>
        <CardHeader
          title="Computed totals"
          subtitle="Read-only. If a number is wrong, correct the record it comes from — the total follows."
        />
        {counters.computed.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">
            Nothing to compute yet. Totals appear as you enter records.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {[...byModule.entries()].map(([moduleName, list]) => (
              <div key={moduleName} className="p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                    {moduleName}
                  </h3>
                  <Link
                    href={`/m/${list[0]!.moduleKey}`}
                    className="text-2xs text-primary hover:underline"
                  >
                    open module →
                  </Link>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {list.map((c) => (
                    <StatTile
                      key={c.key}
                      label={c.label}
                      value={c.format === 'money' ? formatRupees(c.value) : c.value}
                      note={
                        c.baseline > 0
                          ? `includes ${c.baseline} declared before the portal`
                          : c.window === 'sinceJoining' ? 'since joining BIT' : 'this cycle'
                      }
                      href={`/m/${c.moduleKey}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* declared figures */}
      <Card padded={false}>
        <CardHeader
          title="Figures you declare"
          subtitle="Thirteen numbers the portal cannot compute until historical data is imported. Every change is audited."
        />
        <DeclaredCounters initial={counters.declared} />
      </Card>

      {/* how the numbers are built */}
      <Card className="mt-4" padded={false}>
        <CardHeader title="Where each number comes from" />
        <Table>
          <thead>
            <tr>
              <Th>Kind</Th>
              <Th className="w-24 text-right">How many</Th>
              <Th>Source</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>Typed by you</Td>
              <Td className="text-right font-mono tabular-nums">{profileModule?.fields.length ?? 0}</Td>
              <Td className="text-ink-muted">The faculty annexure fields above.</Td>
            </tr>
            <tr>
              <Td>Computed</Td>
              <Td className="text-right font-mono tabular-nums">{counters.computed.length}</Td>
              <Td className="text-ink-muted">
                Counted from your submitted, verified and approved records. Drafts never count.
              </Td>
            </tr>
            <tr>
              <Td>Declared</Td>
              <Td className="text-right font-mono tabular-nums">{counters.declared.length}</Td>
              <Td className="text-ink-muted">
                Entered once by you, until historical data is imported after sign-off.
              </Td>
            </tr>
          </tbody>
        </Table>
      </Card>
    </AppShell>
  );
}
