import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/AppShell';
import { Notice, LinkButton } from '@/components/ui';
import { IconArrowBack } from '@/components/shell/Icon';
import { RecordForm, type FormFieldDef } from '@/components/form/RecordForm';
import { requireUser, getActiveCycle, getSidebarGroups } from '@/server/page-data';
import { activeCycle, ServiceError } from '@/server/records/service';
import { periodOptions } from '@/server/records/periods';
import { canViewModule, canCreateIn } from '@/server/auth/permissions';
import { getModule } from '@/modules';
import { toFormFields, lockedStrip, periodRangeLabel } from '@/components/records/form-fields';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ moduleKey: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { moduleKey } = await params;
  const m = getModule(moduleKey);
  return { title: m ? `Add ${m.name} record · DARP` : 'Add record · DARP' };
}

export default async function NewRecordPage({ params }: PageProps) {
  const { moduleKey } = await params;

  const user = await requireUser();
  const m = getModule(moduleKey);
  if (!m || !canViewModule(user, m)) notFound();

  const cycle = await getActiveCycle();
  const groups = await getSidebarGroups(user, cycle.id);

  const crumbs = [
    { label: 'Overview', href: '/dashboard' },
    { label: m.name, href: `/m/${m.key}` },
    { label: 'Add record' },
  ];

  const shell = (children: React.ReactNode) => (
    <AppShell
      user={user}
      groups={groups}
      crumbs={crumbs}
      title={`Add a ${m.name.toLowerCase()} record`}
      subtitle={m.description}
      cycleName={cycle.name}
      actions={
        <LinkButton href={`/m/${m.key}`} variant="secondary">
          <IconArrowBack width={14} height={14} />
          Back to list
        </LinkButton>
      }
    >
      {children}
    </AppShell>
  );

  if (!canCreateIn(user, m)) {
    return shell(
      <Notice tone="warning" title="This module is not yours to add to">
        You can read {m.name.toLowerCase()} records for your scope, but only the owning role enters
        them. Ask the office that owns this module to add the record.
      </Notice>,
    );
  }

  if (!cycle.id) {
    return shell(
      <Notice tone="warning" title="No active reporting cycle">
        IQAC has not opened a reporting cycle, so a record cannot be added yet.
      </Notice>,
    );
  }

  let periodLabel: string;
  try {
    periodLabel = periodRangeLabel(periodOptions(m, await activeCycle()));
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
    return shell(<Notice tone="warning" title="This record cannot be added yet">{e.message}</Notice>);
  }

  const fields: FormFieldDef[] = await toFormFields(m);

  return shell(
    <>
      <Notice tone="info" className="mb-4">
        The reporting period is taken from the dated field you fill in, inside the cycle window
        shown below. Fields marked with an asterisk are required before the record can be submitted;
        anything else can be saved as a draft and finished later.
      </Notice>
      <RecordForm
        moduleKey={m.key}
        fields={fields}
        locked={lockedStrip(m, user, periodLabel)}
      />
    </>,
  );
}
