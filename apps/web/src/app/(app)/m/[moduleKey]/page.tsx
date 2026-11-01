import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/AppShell';
import { FacultyExamsPanel } from '@/components/records/FacultyExamsPanel';
import {
  Card, CardHeader, Eyebrow, LinkButton, Notice, EmptyState,
  Table, Th, Td, StatePill,
} from '@/components/ui';
import { IconPlus, IconUpload, IconChevronLeft, IconChevronRight, IconAlert } from '@/components/shell/Icon';
import { ListControls } from '@/components/records/ListControls';
import { ViewToolbar } from '@/components/views/ViewToolbar';
import { NilDeclaration } from '@/components/records/NilDeclaration';
import { requireMe, loadPageData } from '@/lib/api.server';
import type { ModuleSchemaPayload, RecordListPayload } from '@darp/shared/contracts';
import { getModule } from '@darp/shared/modules';
import { displayValue, formatDateTime, truncate, STATUS_LABEL } from '@darp/shared/format';
import type { RecordStatus } from '@darp/shared/modules/types';
import { cx } from '@/lib/cx';
import { decodeView, conditionCount } from '@darp/shared/views';
import { ROLE_LABEL } from '@darp/shared/roles';

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

const STATUS_ORDER: RecordStatus[] = ['draft', 'approved', 'returned'];

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

const NOT_FILLED = 'border-line-strong bg-surface-inset text-ink-muted';

/** A query string that keeps the current filters and changes only what is passed. */
function buildQuery(
  base: { q: string; status: string; year: string; page: number; check: boolean; view: string },
  next: Partial<{ q: string; status: string; year: string; page: number; check: boolean; view: string }>,
): string {
  const merged = { ...base, ...next };
  const p = new URLSearchParams();
  if (merged.q) p.set('q', merged.q);
  if (merged.status) p.set('status', merged.status);
  if (merged.year) p.set('year', merged.year);
  if (merged.check) p.set('check', '1');
  if (merged.view) p.set('view', merged.view);
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
  // Faculty have nothing to list for a record kept on its own page: their profile is the page.
  if (m.singleton && user.role === 'faculty') redirect('/profile');

  const crumbs = [
    { label: 'Overview', href: '/dashboard' },
    { label: m.group },
    { label: m.name },
  ];

  const subtitle = `${m.description} Reporting period: ${PERIOD_WORD[m.periodType]}.`;

  const q = one(sp.q);
  const statusParam = one(sp.status);
  // The Faculty Profile lists every person in reach, so "not filled yet" is a status there.
  const isRoster = m.key === 'profile' && user.role !== 'faculty';
  const status = isStatus(statusParam) || (isRoster && statusParam === 'none') ? statusParam : '';
  const year = one(sp.year);
  const yearNum = /^\d{4}$/.test(year) ? Number(year) : 0;
  const pageParam = Number(one(sp.page));
  const page = Number.isInteger(pageParam) && pageParam > 1 ? pageParam : 1;
  const saved = one(sp.saved) === '1';
  const deleted = one(sp.deleted) === '1';
  // Only records with points to check: a module whose records are checked against the publisher.
  const check = !!m.lookup && one(sp.check) === '1';
  // The open view (conditions, sort, grouping, chosen fields): kept as written in the address, read by the server.
  const viewParam = one(sp.view).slice(0, 20_000);

  const listQuery = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (q) listQuery.set('q', q);
  if (status) listQuery.set('status', status);
  if (yearNum) listQuery.set('year', String(yearNum));
  if (check) listQuery.set('check', '1');
  if (viewParam) listQuery.set('view', viewParam);

  // A role that may not open this module gets the 404 page from either request.
  const [schema, listed] = await Promise.all([
    loadPageData<ModuleSchemaPayload>(`/api/modules/${m.key}/schema`),
    cycle.id ? loadPageData<RecordListPayload>(`/api/modules/${m.key}/records?${listQuery}`) : null,
  ]);

  if (!cycle.id) {
    return (
      <AppShell user={user} groups={groups} crumbs={crumbs} title={m.name} subtitle={subtitle}>
        <Notice tone="warning" title="No active reporting cycle">
          IQAC has not opened a reporting cycle yet, so records cannot be listed or added.
        </Notice>
      </AppShell>
    );
  }

  if (!schema.ok || !listed?.ok) {
    const refusal = !schema.ok ? schema.message : listed && !listed.ok ? listed.message : null;
    return (
      <AppShell user={user} groups={groups} crumbs={crumbs} title={m.name} subtitle={subtitle}>
        <Notice tone="warning" title="These records cannot be listed yet">{refusal}</Notice>
      </AppShell>
    );
  }

  const list = listed.data;
  const { counts, recordPeriods, canCreate } = schema.data;
  const view = decodeView(viewParam, schema.data.viewColumns);
  // A module kept on its own page (the Faculty Profile) is never added to from the list.
  const mayCreate = canCreate && !m.managedAt;
  const managedLink = m.managedAt && m.ownerRoles.includes(user.role) ? m.managedAt : null;

  const base = { q, status, year, page, check, view: viewParam };
  const pageCount = Math.max(1, Math.ceil(list.total / list.pageSize));
  const from = list.total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.page * list.pageSize, list.total);
  const filtered = !!(q || status || year || check || conditionCount(view) > 0);
  const showOwner = list.rows.some((r) => !r.isMine);

  const columns = (view.cols ?? m.listColumns).map((key) => {
    const field = m.fields.find((f) => f.key === key);
    const derived = (m.derived ?? []).find((d) => d.key === key);
    return { key, label: field?.label ?? derived?.label ?? key, type: field?.type ?? 'text', derived: !!derived };
  });
  /** A cell's text: a stored field, or a value worked out by the server (the journal's ranking). */
  const cellText = (row: (typeof list.rows)[number], c: (typeof columns)[number]) => (
    c.derived ? row.derived[c.key] ?? ''
      : (row.data[c.key] === undefined || row.data[c.key] === '') && m.fields.find((f) => f.key === c.key)?.naWhenEmpty ? 'NA'
      : displayValue(row.data[c.key], c.type)
  );

  return (
    <AppShell
      user={user}
      groups={groups}
      crumbs={crumbs}
      title={m.name}
      subtitle={subtitle}
      actions={mayCreate ? (
        <div className="flex flex-wrap gap-2">
          {/* A file of DOIs or patent numbers: modules that fetch their records from a register. */}
          {m.lookup ? (
            <LinkButton href={`/m/${m.key}/bulk`} variant="secondary">
              <IconUpload width={14} height={14} />
              Add many at once
            </LinkButton>
          ) : null}
          <LinkButton href={`/m/${m.key}/new`}>
            <IconPlus width={14} height={14} />
            Add record
          </LinkButton>
        </div>
      ) : managedLink ? (
        <LinkButton href={managedLink.href} variant="secondary">{managedLink.label}</LinkButton>
      ) : null}
    >
      {m.key === 'exams' && ['cdc', 'admin'].includes(user.role) ? <FacultyExamsPanel /> : null}

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
          {(m.singleton ? [] : STATUS_ORDER).map((s) => {
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
          {isRoster ? (
            <li>
              <a
                href={`/m/${m.key}${buildQuery(base, { status: status === 'none' ? '' : 'none', page: 1 })}`}
                aria-current={status === 'none' ? 'true' : undefined}
                className={cx(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-semibold no-underline',
                  NOT_FILLED,
                  status === 'none' && 'ring-1 ring-primary',
                )}
              >
                Not filled yet
              </a>
            </li>
          ) : null}
          {m.lookup ? (
            <li>
              <a
                href={`/m/${m.key}${buildQuery(base, { check: !check, page: 1 })}`}
                aria-current={check ? 'true' : undefined}
                title="Records with details the owner changed or typed, or that could not be confirmed automatically"
                className={cx(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-semibold no-underline',
                  'border-warning-100 bg-warning-50 text-warning-700',
                  check && 'ring-1 ring-primary',
                )}
              >
                Points to check only
              </a>
            </li>
          ) : null}
        </ul>
      </div>

      {saved ? (
        <Notice tone="success" className="mb-4">Your record was saved.</Notice>
      ) : null}
      {deleted ? (
        <Notice tone="info" className="mb-4">The record was deleted.</Notice>
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

        {/* The profile roster (everyone in reach, filled in or not) is a different list: a view cannot filter it. */}
        {isRoster ? null : (
          <ViewToolbar
            moduleKey={m.key}
            columns={schema.data.viewColumns}
            usualCols={m.listColumns}
            view={view}
            total={list.total}
            base={{ q, status, year, check }}
            isAdmin={user.role === 'admin'}
          />
        )}

        <ListControls
          view={viewParam}
          moduleKey={m.key}
          moduleName={m.name}
          q={q}
          status={status}
          year={year}
          periods={recordPeriods}
          roster={isRoster}
        />

        {list.rows.length === 0 ? (
          filtered ? (
            <EmptyState
              title="No record matches these filters"
              action={<LinkButton href={`/m/${m.key}`} variant="secondary">Clear filters</LinkButton>}
            >
              Widen the search, choose a different status, or clear the filters to see every record.
            </EmptyState>
          ) : (
            <EmptyState
              title={`No ${m.name.toLowerCase()} recorded yet`}
              action={mayCreate ? (
                <LinkButton href={`/m/${m.key}/new`}>
                  <IconPlus width={14} height={14} />
                  Add the first record
                </LinkButton>
              ) : managedLink ? (
                <LinkButton href={managedLink.href}>{managedLink.label}</LinkButton>
              ) : null}
            >
              Records added here are counted automatically in the profile totals and the department
              roll-up — nothing is tallied by hand.
              {mayCreate ? ' If there is genuinely nothing to report, declare a nil return below.' : null}
            </EmptyState>
          )
        ) : (
          <Table>
            <caption className="sr-only">
              {m.name} records
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
              {list.rows.map((row, idx) => {
                const span = columns.length + 3 + (showOwner ? 1 : 0);
                // A heading row where the group changes, with the group's size across every page.
                const heading = view.groupBy && (idx === 0 || list.rows[idx - 1]!.group !== row.group) ? (
                  <tr key={`${row.id}-group`}>
                    <td colSpan={span} className="border-b border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink">
                      {row.group ?? '(none)'}
                      <span className="ml-2 font-mono font-normal text-ink-muted">
                        {list.groups?.find((g) => g.label === row.group)?.count ?? ''}
                      </span>
                    </td>
                  </tr>
                ) : null;
                return [
                  heading,
                  <tr key={row.id} className="hover:bg-surface-2">
                    {columns.map((c, i) => (
                      <Td key={c.key}>
                        {i === 0 && row.noRecord ? (
                          <span className="font-semibold">{displayValue(row.ownerName)}</span>
                        ) : i === 0 ? (
                          <a
                            href={`/m/${m.key}/${row.id}`}
                            className="font-semibold text-primary underline-offset-2 hover:underline"
                          >
                            {truncate(cellText(row, c), 80)}
                          </a>
                        ) : c.key === 'validUntil' && /expired|not given/.test(cellText(row, c)) ? (
                          // An expired award or MoU, or one saved before its date or validity was asked for.
                          <span className="text-ink-muted">{cellText(row, c)}</span>
                        ) : (
                          truncate(cellText(row, c), 60)
                        )}
                      </Td>
                    ))}
                    <Td className="whitespace-nowrap font-mono text-2xs tabular-nums text-ink-muted">
                      {row.periodLabel}
                    </Td>
                    <Td>
                      {row.noRecord ? (
                        <span className={cx('inline-flex rounded-sm border px-1.5 py-0.5 text-xs font-semibold', NOT_FILLED)}>Not filled yet</span>
                      ) : m.singleton ? (
                        <span className={cx('inline-flex rounded-sm border px-1.5 py-0.5 text-xs font-semibold', row.status === 'approved' ? 'border-success-100 bg-success-50 text-success-700' : NOT_FILLED)}>
                          {row.status === 'approved' ? 'Filled in' : 'Not complete'}
                        </span>
                      ) : <StatePill status={row.status} />}
                      {row.needsCheck && !m.singleton ? (
                        <span
                          className="ml-1.5 inline-flex rounded-sm border border-warning-100 bg-warning-50 px-1.5 py-0.5 text-2xs font-semibold text-warning-700"
                          title="Approved automatically; some details could not be confirmed. Open it to see what to check."
                        >
                          Check
                        </span>
                      ) : null}
                    </Td>
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
                    <tr key={`${row.id}-remark`} className={row.isMine ? 'bg-danger-50' : 'bg-surface-2'}>
                      <td colSpan={span} className="border-b border-line px-3 py-2">
                        <p className={cx('flex items-start gap-1.5 text-xs', row.isMine ? 'text-danger-700' : 'text-ink-muted')}>
                          <IconAlert width={13} height={13} className="mt-0.5 shrink-0" />
                          <span>
                            <span className="font-semibold">
                              {row.isMine
                                ? 'Returned for correction. '
                                : `Returned to ${displayValue(row.ownerName)}${row.returnedByRole ? ` by ${ROLE_LABEL[row.returnedByRole]}` : ''}${row.returnedAt ? ` on ${formatDateTime(row.returnedAt)}` : ''}, waiting for them. `}
                            </span>
                            <a href={`/m/${m.key}/${row.id}#remark`} className="font-semibold underline">
                              Click to see the remark
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
          <NilDeclaration moduleKey={m.key} moduleName={m.name} periodType={m.periodType} declaredYears={schema.data.declaredYears} years={schema.data.declarableYears} />
        ) : null}
      </Card>
    </AppShell>
  );
}
