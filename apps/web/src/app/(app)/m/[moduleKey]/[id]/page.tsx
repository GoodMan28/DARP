import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/AppShell';
import {
  Card, CardHeader, Notice, LinkButton, StatePill, Table, Th, Td,
} from '@/components/ui';
import { IconArrowBack, IconLock } from '@/components/shell/Icon';
import { RecordForm } from '@/components/form/RecordForm';
import { ActionRail, type RailAction } from '@/components/records/ActionRail';
import { lockedStrip } from '@/components/records/form-fields';
import { requireMe, loadPageData } from '@/lib/api.server';
import { LOOKUP_SOURCE_LABEL, type ModuleSchemaPayload, type RecordDetail } from '@darp/shared/contracts';
import { getModule } from '@darp/shared/modules';
import { formatDateTime, STATUS_LABEL } from '@darp/shared/format';
import { ROLE_LABEL } from '@darp/shared/roles';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ moduleKey: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { moduleKey } = await params;
  const m = getModule(moduleKey);
  return { title: m ? `${m.name} record · DARP` : 'Record · DARP' };
}

export default async function RecordPage({ params }: PageProps) {
  const { moduleKey, id } = await params;

  const m = getModule(moduleKey);
  if (!m) notFound();

  const { user, cycle, groups } = await requireMe();

  // Either request 404s for a role that may not open this module, or a record outside its scope.
  const [schema, loaded] = await Promise.all([
    loadPageData<ModuleSchemaPayload>(`/api/modules/${m.key}/schema`),
    loadPageData<RecordDetail>(`/api/modules/${m.key}/records/${encodeURIComponent(id)}`),
  ]);

  if (!schema.ok || !loaded.ok) {
    return (
      <AppShell
        user={user}
        groups={groups}
        crumbs={[{ label: 'Overview', href: '/dashboard' }, { label: m.name, href: `/m/${m.key}` }]}
        title={`${m.name} record`}
        cycleName={cycle.name}
      >
        <Notice tone="warning" title="This record cannot be opened">
          {!loaded.ok ? loaded.message : !schema.ok ? schema.message : null}
        </Notice>
      </AppShell>
    );
  }

  const record = loaded.data;
  const editable = record.canEdit && record.editValues !== null;
  const mayVerify = schema.data.canVerify;
  const isAdmin = user.role === 'admin';

  /*
   * Only the transitions this viewer may actually take are offered. The server re-checks
   * every one in canTransition(), so this list is courtesy rather than security: it exists
   * so nobody is shown a button that will refuse them.
   */
  const rail: RailAction[] = [];
  if (record.status === 'submitted' && mayVerify) rail.push('verify');
  // Approved-on-submission modules are checked afterwards: the office and IQAC may return an approved record.
  const returnable = record.status === 'submitted' || record.status === 'verified'
    || (record.status === 'approved' && m.lookup?.autoApprove === 'always');
  if (returnable && mayVerify) rail.push('return');
  if (record.status === 'verified' && isAdmin) rail.push('approve');
  if (record.status === 'approved' && isAdmin) rail.push('unlock');

  const { fields } = schema.data;
  const primary = m.listColumns[0];
  const heading = primary && record.data[primary] ? String(record.data[primary]) : `${m.name} record`;

  const crumbs = [
    { label: 'Overview', href: '/dashboard' },
    { label: m.name, href: `/m/${m.key}` },
    { label: editable ? 'Edit record' : 'View record' },
  ];

  return (
    <AppShell
      user={user}
      groups={groups}
      crumbs={crumbs}
      title={heading}
      subtitle={`${m.name} · ${record.periodLabel} · ${STATUS_LABEL[record.status] ?? record.status}`}
      cycleName={cycle.name}
      actions={
        <LinkButton href={`/m/${m.key}`} variant="secondary">
          <IconArrowBack width={14} height={14} />
          Back to list
        </LinkButton>
      }
    >
      {record.status === 'returned' && record.returnedRemark ? (
        <Notice tone="danger" title="Returned for correction" className="mb-4">
          {record.returnedRemark}
          {editable ? ' Correct the fields below and submit it again.' : null}
        </Notice>
      ) : null}

      {!editable ? (
        <Notice tone="info" className="mb-4">
          <span className="inline-flex items-center gap-1.5">
            <IconLock width={13} height={13} />
            This record is {(STATUS_LABEL[record.status] ?? record.status).toLowerCase()}, so it is
            read-only. Ask the verifying office to return it if something needs changing.
          </span>
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <RecordForm
            moduleKey={m.key}
            fields={fields}
            recordId={record.id}
            initialValues={editable ? (record.editValues ?? {}) : record.data}
            lookup={schema.data.lookup}
            initialLocked={record.lockedFields}
            locked={lockedStrip(m, user, record.periodLabel, record.ownerName)}
            readOnly={!editable}
          />
        </div>

        <aside className="space-y-4">
          {record.verification ? (
            record.verification.autoApproved && record.verification.reasons.length === 0 ? (
              <Notice tone="success" title="Checked automatically">
                Matched the published record
                {record.verification.source ? ` at ${LOOKUP_SOURCE_LABEL[record.verification.source]}` : ''} on{' '}
                {formatDateTime(record.verification.checkedAt)}. No manual verification was needed.
              </Notice>
            ) : record.verification.autoApproved ? (
              <Notice tone="warning" title="Approved automatically — points to check">
                Approved on submission. These details could not be confirmed automatically; check them against
                the evidence, and use “Return to owner” if something is wrong.
                <ul className="mt-1 list-disc pl-5">
                  {record.verification.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </Notice>
            ) : record.verification.reasons.length > 0 ? (
              <Notice tone="info" title="Why the verifying office checks this record">
                <ul className="mt-1 list-disc pl-5">
                  {record.verification.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </Notice>
            ) : null
          ) : null}

          <Card padded={false}>
            <CardHeader title="Status" subtitle={`Last updated ${formatDateTime(record.updatedAt)}`} />
            <div className="space-y-3 p-3">
              <StatePill status={record.status} />
              {rail.length > 0 ? (
                <ActionRail moduleKey={m.key} recordId={record.id} actions={rail} verifyIsFinal={m.lookup?.autoApprove === 'always'} />
              ) : (
                <p className="text-xs text-ink-muted">
                  No workflow action is available to you on this record right now.
                </p>
              )}
            </div>
          </Card>

          <Card padded={false}>
            <CardHeader title="Workflow history" subtitle="Every status change, with who made it" />
            {record.history.length === 0 ? (
              <p className="px-3 py-4 text-xs text-ink-muted">
                Nothing yet — the record has not left draft.
              </p>
            ) : (
              <Table>
                <caption className="sr-only">Workflow history for this record</caption>
                <thead>
                  <tr>
                    <Th>Change</Th>
                    <Th>By</Th>
                  </tr>
                </thead>
                <tbody>
                  {record.history.map((h, i) => (
                    <tr key={`${h.toStatus}-${i}`}>
                      <Td>
                        <span className="block text-xs font-semibold text-ink">
                          {STATUS_LABEL[h.fromStatus] ?? h.fromStatus}
                          {' → '}
                          {STATUS_LABEL[h.toStatus] ?? h.toStatus}
                        </span>
                        <span className="mt-0.5 block text-2xs text-ink-muted">
                          {formatDateTime(h.at)}
                        </span>
                        {h.remark ? (
                          <span className="mt-1 block text-xs text-ink-muted">“{h.remark}”</span>
                        ) : null}
                      </Td>
                      <Td className="text-2xs text-ink-muted">
                        <span className="block font-semibold text-ink">{h.actorName}</span>
                        {ROLE_LABEL[h.actorRole]}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
