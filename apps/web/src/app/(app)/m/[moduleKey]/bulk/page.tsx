import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/AppShell';
import { Notice, LinkButton } from '@/components/ui';
import { IconArrowBack } from '@/components/shell/Icon';
import { BulkUpload } from '@/components/records/BulkUpload';
import { requireMe, loadPageData } from '@/lib/api.server';
import type { ModuleSchemaPayload } from '@darp/shared/contracts';
import { getModule } from '@darp/shared/modules';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ moduleKey: string }>;
  /** ?id=<upload id>: reopens an upload, so a refresh does not lose the review table. */
  searchParams: Promise<{ id?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { moduleKey } = await params;
  const m = getModule(moduleKey);
  return { title: m ? `Add many ${m.name} records · DARP` : 'Add many records · DARP' };
}

export default async function BulkPage({ params, searchParams }: PageProps) {
  const { moduleKey } = await params;
  const id = (await searchParams).id;
  const m = getModule(moduleKey);
  if (!m || !m.lookup) notFound();

  const { user, groups } = await requireMe();
  const what = { doi: 'DOIs', book: 'DOIs or ISBNs', patent: 'patent numbers' }[m.lookup.kind];
  const schema = await loadPageData<ModuleSchemaPayload>(`/api/modules/${m.key}/schema`);

  const shell = (children: React.ReactNode) => (
    <AppShell
      user={user}
      groups={groups}
      crumbs={[
        { label: 'Overview', href: '/dashboard' },
        { label: m.name, href: `/m/${m.key}` },
        { label: 'Add many at once' },
      ]}
      title={`Add many ${m.name.toLowerCase()} at once`}
      subtitle={`Upload a file of ${what}. DARP fetches each one and makes a draft of every one you have not already added; you then complete them, attach the evidence and submit the ones you choose.`}
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

  if (!schema.ok) return shell(<Notice tone="warning">{schema.message}</Notice>);
  if (!schema.data.canCreate) {
    return shell(<Notice tone="warning" title="This module is not yours to add to">Only the owning role enters these records.</Notice>);
  }

  return shell(
    <BulkUpload
      moduleKey={m.key}
      moduleName={m.name}
      kind={m.lookup.kind}
      what={what}
      initialId={id && /^[0-9a-f-]{36}$/i.test(id) ? id : null}
    />,
  );
}
