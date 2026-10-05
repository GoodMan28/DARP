import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/AppShell';
import {
  Card, CardHeader, Eyebrow, LinkButton, Notice, EmptyState,
  Table, Th, Td, StatePill,
} from '@/components/ui';
import { IconPlus, IconChevronLeft, IconChevronRight, IconAlert } from '@/components/shell/Icon';
import { ListControls } from '@/components/records/ListControls';
import { NilDeclaration } from '@/components/records/NilDeclaration';
import { requireMe, loadPageData } from '@/lib/api.server';
import type { ModuleSchemaPayload, RecordListPayload } from '@darp/shared/contracts';
import { getModule } from '@darp/shared/modules';
import { displayValue, formatDateTime, truncate, STATUS_LABEL } from '@darp/shared/format';
import type { RecordStatus } from '@darp/shared/modules/types';
import { cx } from '@/lib/cx';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;

interface PageProps {
  params: Promise<{ moduleKey: string }>;
  searchParams: Promise<Search>;
}

const PERIOD_WORD: Record<string, string> = {
  CY: 'calendar year',
  FY: 'financial year (April–March)',
  AY: 'academic year (July–June)',
};

const STATUS_ORDER: RecordStatus[] = ['draft', 'submitted', 'verified', 'approved', 'returned'];

const CHIP_TONE: Record<RecordStatus, string> = {
  draft: 'border-line-strong bg-surface-inset text-ink-muted',
  submitted: 'border-info-100 bg-info-50 text-info-700',
  verified: 'border-violet-100 bg-violet-50 text-violet-700',
  approved: 'border-success-100 bg-success-50 text-success-700',
  returned: 'border-danger-100 bg-danger-50 text-danger-700',
};

function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

function isStatus(v: string): v is RecordStatus {
  return (STATUS_ORDER as string[]).includes(v);
}

/** A query string that keeps the current filters and changes only what is passed. */
function buildQuery(
  base: { q: string; status: string; year: string; page: number },
  next: Partial<{ q: string; status: string; year: string; page: number }>,
): string {
  const merged = { ...base, ...next };
  const p = new URLSearchParams();
  if (merged.q) p.set('q', merged.q);
  if (merged.status) p.set('status', merged.status);
  if (merged.year) p.set('year', merged.year);
  if (merged.page > 1) p.set('page', String(merged.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { moduleKey } = await params;
  const m = getModule(moduleKey);
  return { title: m ? `${m.name} · DARP` : 'Module · DARP' };
}

export default async function ModuleListPage({ params, searchParams }: PageProps) {
  const { moduleKey } = await params;
  const sp = await searchParams;

  const m = getModule(moduleKey);
  if (!m) notFound();

  const { user, cycle, groups } = await requireMe();

  const crumbs = [
    { label: 'Overview', href: '/dashboard' },
    { label: m.group },
    { label: m.name },
  ];

  const subtitle = `${m.description} Reporting period: ${PERIOD_WORD[m.periodType]}.`;

  const q = one(sp.q);
  const statusParam = one(sp.status);
  const status = isStatus(statusParam) ? statusParam : '';
  const year = one(sp.year);
  const yearNum = /^\d{4}$/.test(year) ? Number(year) : 0;
  const pageParam = Number(one(sp.page));
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;
  const saved = one(sp.saved) === '1';

  const listQuery = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (q) listQuery.set('q', q);
  if (status) listQuery.set('status', status);
  if (yearNum) listQuery.set('year', String(yearNum));

  // A role that may not open this module gets the 404 page from either request.
  const [schema, listed] = await Promise.all([
    loadPageData<ModuleSchemaPayload>(`/api/modules/${m.key}/schema`),
    cycle.id ? loadPageData<RecordListPayload>(`/api/modules/${m.key}/records?${listQuery}`) : null,
  ]);

  if (!cycle.id) {
    return (
      <AppShell user={user} groups={groups} crumbs={crumbs} title={m.name} subtitle={subtitle} cycleName={cycle.name}>
        <Notice tone="warning" title="No active reporting cycle">
          IQAC has not opened a reporting cycle yet, so records cannot be listed or added.
        </Notice>
      </AppShell>
    );
  }

  if (!schema.ok || !listed?.ok) {
    const refusal = !schema.ok ? schema.message : listed && !listed.ok ? listed.message : null;
    return (
      <AppShell user={user} groups={groups} crumbs={crumbs} title={m.name} subtitle={subtitle} cycleName={cycle.name}>
        <Notice tone="warning" title="These records cannot be listed yet">{refusal}</Notice>
      </AppShell>
    );
  }

  const list = listed.data;
  const { counts, periods, canCreate: mayCreate } = schema.data;
  const declaredNil = mayCreate && schema.data.declaredNil;

  const base = { q, status, year, page };
  const pageCount = Math.max(1, Math.ceil(list.total / list.pageSize));
  const from = list.total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.page * list.pageSize, list.total);
  const filtered = !!(q || status || year);
  const showOwner = list.rows.some((r) => !r.isMine);

  const columns = m.listColumns.map((key) => {
    const field = m.fields.find((f) => f.key === key);
    return { key, label: field?.label ?? key, type: field?.type ?? 'text' };
  });

  return (
    <AppShell
      user={user}
      groups={groups}
      crumbs={crumbs}
      title={m.name}
      subtitle={subtitle}
      cycleName={cycle.name}
      actions={mayCreate ? (
        <LinkButton href={`/m/${m.key}/new`}>
          <IconPlus width={14} height={14} />
          Add record
        </LinkButton>
      ) : null}
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div>
          <Eyebrow>Reference</Eyebrow>
          <p className="text-sm text-ink">
            {m.naacRef ? `NAAC ${m.naacRef}` : 'No NAAC criterion'}
            {' · '}
            {m.bodies.join(' · ')}
            {' · '}
            {m.scope === 'self' ? 'Entered per person' : m.scope === 'department' ? 'Entered per department' : 'Entered once for the institute'}
          </p>
        </div>
        <ul className="ml-auto flex flex-wrap gap-1.5">
          {STATUS_ORDER.map((s) => {
            const active = status === s;
            return (
              <li key={s}>
                <a
                  href={`/m/${m.key}${buildQuery(base, { status: active ? '' : s, page: 1 })}`}
                  aria-current={active ? 'true' : undefined}
                  className={cx(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-semibold no-underline',
                    CHIP_TONE[s],
                    active && 'ring-1 ring-primary',
                  )}
                >
                  {STATUS_LABEL[s]}
                  <span className="font-mono tabular-nums">{counts[s]}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      {saved ? (
        <Notice tone="success" className="mb-4">Your record was saved.</Notice>
      ) : null}

      <Card padded={false}>
        <CardHeader
          title={`${m.name} records`}
          subtitle={
            list.total === 0
              ? 'No records match'
              : `Showing ${from}–${to} of ${list.total}${filtered ? ' matching' : ''} record${list.total === 1 ? '' : 's'}`
          }
        />

        <ListControls
          moduleKey={m.key}
          moduleName={m.name}
          q={q}
          status={status}
          year={year}
          periods={periods}
        />

        {list.rows.length === 0 ? (
          filtered ? (
            <EmptyState
              title="No record matches these filters"
              action={<LinkButton href={`/m/${m.key}`} variant="secondary">Clear filters</LinkButton>}
            >
              Widen the search, choose a different status, or clear the filters to see everything in
              this cycle.
            </EmptyState>
          ) : (
            <EmptyState
              title={`No ${m.name.toLowerCase()} recorded in this cycle`}
              action={mayCreate ? (
                <LinkButton href={`/m/${m.key}/new`}>
                  <IconPlus width={14} height={14} />
                  Add the first record
                </LinkButton>
              ) : null}
            >
              Records added here are counted automatically in the profile totals and the department
              roll-up — nothing is tallied by hand. If there is genuinely nothing to report, declare
              a nil return below.
            </EmptyState>
          )
        ) : (
          <Table>
            <caption className="sr-only">
              {m.name} records in {cycle.name}
            </caption>
            <thead>
              <tr>
                {columns.map((c, i) => <Th key={c.key} className={i === 0 ? 'min-w-56' : undefined}>{c.label}</Th>)}
                <Th className="whitespace-nowrap">Period</Th>
                <Th className="whitespace-nowrap">Status</Th>
                {showOwner ? <Th className="whitespace-nowrap">Entered by</Th> : null}
                <Th className="whitespace-nowrap">Last updated</Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((row) => {
                const span = columns.length + 3 + (showOwner ? 1 : 0);
                return [
                  <tr key={row.id} className="hover:bg-surface-2">
                    {columns.map((c, i) => (
                      <Td key={c.key}>
                        {i === 0 ? (
                          <a
                            href={`/m/${m.key}/${row.id}`}
                            className="font-semibold text-primary underline-offset-2 hover:underline"
                          >
                            {truncate(displayValue(row.data[c.key], c.type), 80)}
                          </a>
                        ) : (
                          truncate(displayValue(row.data[c.key], c.type), 60)
                        )}
                      </Td>
                    ))}
                    <Td className="whitespace-nowrap font-mono text-2xs tabular-nums text-ink-muted">
                      {row.periodLabel}
                    </Td>
                    <Td><StatePill status={row.status} /></Td>
                    {showOwner ? (
                      <Td className="whitespace-nowrap text-ink-muted">
                        {row.isMine ? 'You' : displayValue(row.ownerName)}
                      </Td>
                    ) : null}
                    <Td className="whitespace-nowrap text-2xs text-ink-muted">
                      {formatDateTime(row.updatedAt)}
                    </Td>
                  </tr>,
                  row.status === 'returned' && row.returnedRemark ? (
                    <tr key={`${row.id}-remark`} className="bg-danger-50">
                      <td colSpan={span} className="border-b border-line px-3 py-2">
                        <p className="flex items-start gap-1.5 text-xs text-danger-700">
                          <IconAlert width={13} height={13} className="mt-0.5 shrink-0" />
                          <span>
                            <span className="font-semibold">Returned for correction: </span>
                            {row.returnedRemark}
                            {' '}
                            <a href={`/m/${m.key}/${row.id}`} className="font-semibold underline">
                              Open and fix
                            </a>
                          </span>
                        </p>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </Table>
        )}

        {pageCount > 1 ? (
          <nav
            aria-label="Pagination"
            className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2.5 text-xs text-ink-muted"
          >
            <p>
              Page <span className="font-mono tabular-nums">{list.page}</span> of{' '}
              <span className="font-mono tabular-nums">{pageCount}</span>
            </p>
            <div className="flex items-center gap-2">
              {list.page > 1 ? (
                <LinkButton
                  variant="secondary"
                  href={`/m/${m.key}${buildQuery(base, { page: list.page - 1 })}`}
                >
                  <IconChevronLeft width={13} height={13} />
                  Previous
                </LinkButton>
              ) : null}
              {list.page < pageCount ? (
                <LinkButton
                  variant="secondary"
                  href={`/m/${m.key}${buildQuery(base, { page: list.page + 1 })}`}
                >
                  Next
                  <IconChevronRight width={13} height={13} />
                </LinkButton>
              ) : null}
            </div>
          </nav>
        ) : null}

        {mayCreate ? (
          <NilDeclaration moduleKey={m.key} moduleName={m.name} declared={declaredNil} />
        ) : null}
      </Card>
    </AppShell>
  );
}
