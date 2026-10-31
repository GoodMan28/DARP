import { AppShell } from '@/components/shell/AppShell';
import { Card, CardHeader, Notice, LinkButton, StatePill } from '@/components/ui';
import { requireMe, apiGet, loadPageData } from '@/lib/api.server';
import type { CounterValues, IdentityPayload, RecordListPayload } from '@darp/shared/contracts';
import { getModule } from '@darp/shared/modules';
import { displayValue, formatDate } from '@darp/shared/format';
import { ROLE_LABEL } from '@darp/shared/roles';
import { splitName } from '@darp/shared/names';
import { DeclaredCounters } from './DeclaredCounters';
import { OrcidBox } from './OrcidBox';
import { ResearchCard } from '@/components/research/ResearchCard';
import type { ResearchProfile } from '@darp/shared/research';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My profile · DARP' };

/**
 * The person's own information: the details they typed and the figures they declare. The totals
 * counted from their records are on the dashboard ("My numbers"), shown only when asked for.
 */
export default async function ProfilePage() {
  const { user, cycle, groups } = await requireMe();
  const profileModule = getModule('profile');
  // Faculty and HODs fill in the faculty annexure and declare figures; office roles (IQAC, deans)
  // have no records of their own, so their page shows only their account.
  const hasAnnexure = !!profileModule?.ownerRoles.includes(user.role);

  const thisYear = new Date().getFullYear();
  let counters: CounterValues = {
    userId: user.id, range: { from: thisYear - 2, to: thisYear }, minYear: thisYear - 10, maxYear: thisYear, computed: [], declared: [],
  };
  if (cycle.id && hasAnnexure) {
    const r = await loadPageData<CounterValues>('/api/profile/rollups');
    if (!r.ok) throw new Error(r.message);
    counters = r.data;
  }

  // The Faculty Profile is a record like any other: one per user per cycle. Office roles
  // that cannot open the profile module simply have none, so a refusal here is not an error.
  const profileList = cycle.id && profileModule && hasAnnexure
    ? await apiGet<RecordListPayload>('/api/modules/profile/records?pageSize=1&mine=1')
    : null;
  if (profileList && !profileList.ok && profileList.error.code !== 'FORBIDDEN') {
    throw new Error(`GET profile records failed: ${profileList.error.code}`);
  }
  const profileRecord = profileList?.ok ? profileList.data.rows[0] ?? null : null;
  const identity = await loadPageData<IdentityPayload>('/api/profile/identity');
  if (!identity.ok) throw new Error(identity.message);
  const who = identity.data;
  // An account made before names had parts keeps the whole name in "first name": show it in parts.
  const oneBox = !who.middleName && !who.lastName && /\s/.test(who.firstName.trim());
  const shown = oneBox ? { ...splitName(who.firstName), prefix: who.namePrefix || splitName(who.firstName).prefix } : null;
  // Scopus and Web of Science figures: for everyone who fills in the faculty annexure.
  const research = hasAnnexure ? await loadPageData<ResearchProfile>('/api/profile/research') : null;

  return (
    <AppShell
      user={user}
      groups={groups}
      crumbs={[{ label: 'Overview', href: '/dashboard' }, { label: 'My profile' }]}
      title="My profile"
      subtitle={hasAnnexure
        ? 'Your account, your details and the figures you declare. The totals counted from your records are on the Overview page, under My numbers.'
        : 'Your account.'}
      actions={hasAnnexure ? (
        <LinkButton href={profileRecord ? `/m/profile/${profileRecord.id}` : '/m/profile/new'}>
          {profileRecord ? 'Edit my details' : 'Complete my details'}
        </LinkButton>
      ) : undefined}
    >
      {/* the account, for every role */}
      <Card className="mb-4" padded={false}>
        <CardHeader title="Account" subtitle="Your name is set by IQAC; ask IQAC to correct it. Your name is matched against author and inventor lists, so keep it as you publish." />
        <dl className="grid gap-x-8 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Prefix', (shown?.prefix ?? who.namePrefix) || '—'],
            ['First name', shown?.first ?? who.firstName],
            ['Middle name', (shown?.middle ?? who.middleName) || '—'],
            ['Last name', (shown?.last ?? who.lastName) || '—'],
            ['Institute e-mail', user.email],
            ['Role', ROLE_LABEL[user.role]],
            ['Department', user.departmentName ?? '—'],
            ['Date of joining', user.dateOfJoining ? formatDate(user.dateOfJoining) : '—'],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-2xs font-semibold text-ink-muted">{label}</dt>
              <dd className="truncate text-sm text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <OrcidBox initial={who} />
      </Card>

      {hasAnnexure && !profileRecord ? (
        <Notice tone="warning" title="Your profile details are not filled in yet" className="mb-4">
          The faculty annexure needs your designation, qualifications, experience and identifiers.
          The totals counted from your records are on the Overview page, under My numbers.
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
                  <div className="text-2xs font-semibold text-ink-muted">
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

      {research?.ok ? <ResearchCard initial={research.data} /> : null}

      {/* declared figures */}
      {hasAnnexure ? (
        <Card padded={false}>
          <CardHeader
            title="Figures you declare"
            subtitle="Thirteen numbers the portal cannot compute until historical data is imported. Every change is audited."
          />
          <DeclaredCounters initial={counters.declared} />
        </Card>
      ) : null}

    </AppShell>
  );
}
