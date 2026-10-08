import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/AppShell';
import { Notice, LinkButton } from '@/components/ui';
import { IconArrowBack } from '@/components/shell/Icon';
import { RecordForm } from '@/components/form/RecordForm';
import { requireMe, loadPageData } from '@/lib/api.server';
import type { ModuleSchemaPayload } from '@darp/shared/contracts';
import { getModule } from '@darp/shared/modules';
import { lockedStrip, periodRangeLabel } from '@/components/records/form-fields';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ moduleKey: string }>;
  /** ?id=<DOI or ISBN>, handed over by another module's form ("Add it under …"). */
  searchParams: Promise<{ id?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { moduleKey } = await params;
  const m = getModule(moduleKey);
  return { title: m ? `Add ${m.name} record · DARP` : 'Add record · DARP' };
}

export default async function NewRecordPage({ params, searchParams }: PageProps) {
  const { moduleKey } = await params;
  const handedOver = (await searchParams).id?.trim().slice(0, 300) || undefined;

  const m = getModule(moduleKey);
  if (!m) notFound();

  const { user, cycle, groups } = await requireMe();
  // 404s for a role that may not open this module.
  const schema = await loadPageData<ModuleSchemaPayload>(`/api/modules/${m.key}/schema`);

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

  if (!schema.ok) {
    return shell(<Notice tone="warning" title="This record cannot be added yet">{schema.message}</Notice>);
  }

  if (!schema.data.canCreate) {
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

  const periodLabel = periodRangeLabel(schema.data.periods);
  const { fields } = schema.data;

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
        lookup={schema.data.lookup}
        locked={lockedStrip(m, user, periodLabel)}
        handedOver={schema.data.lookup ? handedOver : undefined}
      />
    </>,
  );
}
