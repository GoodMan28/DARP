import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, count } from 'drizzle-orm';
import { db } from '@/server/db';
import { records, recordTransitions, recordEdits, users, departments, moduleDeclarations } from '@/server/db/schema';
import { getModule } from '@darp/shared/modules';
import type { ModuleConfig, RecordStatus, Role } from '@darp/shared/modules/types';
import type { SessionUser } from '@/server/auth/session';
import { scopeFilter } from './scope';
import {
  canCreateIn, canReadRecord, canEditRecord, canDeleteRecord, deleteNeedsReason, canTransition, type WorkflowAction,
} from '@/server/auth/permissions';
import { validateRecord } from './validate';
import { prepareForStorage, presentForRead, presentForEdit } from './prepare';
import { resolvePeriod, type CycleWindows } from './periods';
import { defaultRange, windowsOfRange } from './range';
import { audit } from '@/server/audit/log';
import { derivedValues } from '@/server/journals/ranking';
import { applyLookup, ownerMissingFromAuthors, evidenceMissing } from '@/server/lookup/apply';
import { unattachableFiles, linkEvidence } from './evidenceLinks';
import { systemActor } from '@/server/lookup/system';
import { LOOKUP_SOURCE_LABEL, type RecordVerification, type RecordListRow } from '@darp/shared/contracts';

export class ServiceError extends Error {
  constructor(
    public code: 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT',
    message: string,
    public fields?: Record<string, string>,
  ) { super(message); }
}

/**
 * The database enforces rules the application also checks: one profile per user per
 * cycle, one curriculum-feedback answer per department, one live record per natural
 * key. Losing a race against those constraints must read as a conflict, not a crash.
 */
function asConflict(e: unknown, m: ModuleConfig): never {
  // Drizzle wraps the driver error, so the postgres code may be one level down.
  const cause = (e as { cause?: unknown }).cause;
  const pg = (cause ?? e) as { code?: string; constraint?: string };
  const code = pg.code ?? (e as { code?: string }).code;
  const constraint = pg.constraint ?? (e as { constraint?: string }).constraint ?? '';
  if (code !== '23505') throw e;

  if (constraint.includes('one_profile')) {
    throw new ServiceError('CONFLICT', 'Your profile already exists for this cycle. Edit it instead of adding a second one.');
  }
  if (constraint.includes('one_feedback')) {
    throw new ServiceError('CONFLICT', 'Curriculum feedback is one answer per department per cycle. Edit the existing answer instead.');
  }
  if (constraint.includes('natural_key')) {
    const keyLabel = m.naturalKey?.join(' + ') ?? 'entry';
    throw new ServiceError('CONFLICT', `This ${keyLabel} is already recorded in this cycle.`);
  }
  throw new ServiceError('CONFLICT', 'This conflicts with a record that already exists.');
}

/** Module lookup that fails closed: an unknown key is a 404, never a crash. */
export function mustGetModule(key: string): ModuleConfig {
  const m = getModule(key);
  if (!m) throw new ServiceError('NOT_FOUND', 'That module does not exist.');
  return m;
}

/**
 * The year windows records are counted and labelled against: the default saved range (Administration →
 * Year ranges), else the last three calendar years. It never hides a record: every year is visible.
 */
export async function activeCycle(): Promise<CycleWindows> {
  const r = await defaultRange();
  return windowsOfRange(r, r.id);
}

/* ─────────────────────────────── list ─────────────────────────────── */

export interface ListParams {
  q?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  /** 'none' is the Faculty Profile roster's "not filled in yet". */
  status?: RecordStatus | 'none';
  periodYear?: number;
  /** Only the caller's own records ("My profile" for a HOD, who otherwise gets the department roster). */
  mine?: boolean;
  /** Only records with points for the verifying office or IQAC to check (see needsCheck). */
  check?: boolean;
}

export type ListRow = Omit<RecordListRow, 'updatedAt'> & { updatedAt: Date };
export interface ListResult { total: number; page: number; pageSize: number; rows: ListRow[] }

/** Who sent each returned record back, and when: the latest return of every record on the page. */
async function returnedInfo(ids: string[]): Promise<Map<string, { role: Role; at: string }>> {
  const out = new Map<string, { role: Role; at: string }>();
  if (ids.length === 0) return out;
  const rows = await db.select({ recordId: recordTransitions.recordId, role: recordTransitions.actorRole, at: recordTransitions.at })
    .from(recordTransitions)
    .where(and(inArray(recordTransitions.recordId, ids), eq(recordTransitions.toStatus, 'returned')))
    .orderBy(asc(recordTransitions.at), asc(recordTransitions.id));
  for (const t of rows) out.set(t.recordId, { role: t.role, at: t.at.toISOString() });
  return out;
}

/**
 * The Faculty Profile as a department roster: every active faculty member and HOD the caller may see,
 * with their profile record if they have saved one ("not filled in yet" otherwise).
 */
async function listProfileRoster(actor: SessionUser, m: ModuleConfig, params: ListParams): Promise<ListResult> {
  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 5), 100);
  const page = Math.max(params.page ?? 1, 1);
  let who = and(inArray(users.role, ['faculty', 'hod']), eq(users.isActive, true))!;
  if (actor.role === 'hod') {
    who = actor.departmentId ? and(who, eq(users.departmentId, actor.departmentId))! : and(who, sql`false`)!;
  }
  if (params.q) {
    const needle = `%${params.q.trim().toLowerCase().slice(0, 100)}%`;
    who = and(who, sql`lower(${users.name}) like ${needle}`)!;
  }
  if (params.status === 'none') who = and(who, isNull(records.id))!;
  else if (params.status) who = and(who, eq(records.status, params.status))!;

  const onProfile = and(
    eq(records.ownerUserId, users.id), eq(records.moduleKey, m.key), isNull(records.deletedAt),
  );

  const rows = await db.select({
    userId: users.id, name: users.name, userCreatedAt: users.createdAt,
    id: records.id, status: records.status, periodLabel: records.periodLabel, periodYear: records.periodYear,
    data: records.data, updatedAt: records.updatedAt, returnedRemark: records.returnedRemark, verification: records.verification,
  }).from(users).leftJoin(records, onProfile).where(who).orderBy(asc(users.name)).limit(pageSize).offset((page - 1) * pageSize);
  const [totalRow] = await db.select({ n: count() }).from(users).leftJoin(records, onProfile).where(who);
  const returned = await returnedInfo(rows.filter((r) => r.status === 'returned').map((r) => r.id!));

  return {
    total: totalRow?.n ?? 0,
    page,
    pageSize,
    rows: rows.map((r): ListRow => {
      const mine = r.userId === actor.id;
      if (!r.id) {
        return {
          id: r.userId, status: 'draft' as RecordStatus, periodLabel: '', periodYear: 0, ownerName: r.name,
          isMine: mine, returnedRemark: null, needsCheck: false, updatedAt: r.userCreatedAt, data: { name: r.name },
          derived: {}, returnedByRole: null, returnedAt: null, noRecord: true,
        };
      }
      return {
        id: r.id, status: r.status!, periodLabel: r.periodLabel!, periodYear: r.periodYear!,
        ownerName: r.name, isMine: mine, returnedRemark: r.returnedRemark,
        needsCheck: needsCheck(r.verification as RecordVerification | null, r.status!),
        updatedAt: r.updatedAt!, derived: {},
        data: presentForRead(m, r.data as Record<string, unknown>, { includeSensitive: mine || actor.role === 'admin' }),
        returnedByRole: returned.get(r.id)?.role ?? null, returnedAt: returned.get(r.id)?.at ?? null,
      };
    }),
  };
}

export async function listRecords(actor: SessionUser, moduleKey: string, params: ListParams): Promise<ListResult> {
  const m = mustGetModule(moduleKey);

  if (m.key === 'profile' && actor.role !== 'faculty' && !params.check && !params.periodYear && !params.mine) {
    return listProfileRoster(actor, m, params);
  }

  let where = scopeFilter(actor, m);
  if (params.status && params.status !== 'none') where = and(where, eq(records.status, params.status))!;
  if (params.periodYear) where = and(where, eq(records.periodYear, params.periodYear))!;
  if (params.mine) where = and(where, eq(records.ownerUserId, actor.id))!;
  if (params.check) {
    where = and(
      where,
      inArray(records.status, [...CHECKED_STATUSES]),
      sql`jsonb_array_length(coalesce(${records.verification} -> 'reasons', '[]'::jsonb)) > 0`,
    )!;
  }
  if (params.q) {
    const needle = `%${params.q.trim().toLowerCase().slice(0, 100)}%`;
    where = and(where, sql`${records.searchText} like ${needle}`)!;
  }

  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 5), 100);
  const page = Math.max(params.page ?? 1, 1);

  // Sorting is restricted to configured columns — never interpolate a user string into SQL.
  // Derived columns (the journal's ranking) are not stored, so they cannot be sorted on.
  const sortable = new Set(m.listColumns.filter((k) => m.fields.some((f) => f.key === k)));
  const dir = params.dir === 'desc' ? desc : asc;
  const orderBy = params.sort && sortable.has(params.sort)
    ? dir(sql`${records.data} ->> ${params.sort}`)
    : desc(records.updatedAt);

  const rows = await db
    .select({
      id: records.id,
      status: records.status,
      periodLabel: records.periodLabel,
      periodYear: records.periodYear,
      data: records.data,
      ownerUserId: records.ownerUserId,
      ownerName: users.name,
      departmentId: records.departmentId,
      updatedAt: records.updatedAt,
      returnedRemark: records.returnedRemark,
      verification: records.verification,
    })
    .from(records)
    .innerJoin(users, eq(users.id, records.ownerUserId))
    .where(where)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [totalRow] = await db.select({ n: count() }).from(records).where(where);
  const derived = await derivedValues(m, rows.map((r) => ({ key: r.id, data: r.data as Record<string, unknown> })));
  const returned = await returnedInfo(rows.filter((r) => r.status === 'returned').map((r) => r.id));

  return {
    total: totalRow?.n ?? 0,
    page,
    pageSize,
    rows: rows.map((r) => ({
      id: r.id,
      status: r.status,
      periodLabel: r.periodLabel,
      periodYear: r.periodYear,
      ownerName: r.ownerName,
      isMine: r.ownerUserId === actor.id,
      returnedRemark: r.returnedRemark,
      needsCheck: needsCheck(r.verification as RecordVerification | null, r.status),
      updatedAt: r.updatedAt,
      data: presentForRead(m, r.data as Record<string, unknown>, {
        includeSensitive: r.ownerUserId === actor.id || actor.role === 'admin',
      }),
      derived: derived.get(r.id) ?? {},
      returnedByRole: returned.get(r.id)?.role ?? null,
      returnedAt: returned.get(r.id)?.at ?? null,
    })),
  };
}

/** The periods this caller's records are filed under, in the cycle's window or not — for the year filter. */
export async function periodsInUse(actor: SessionUser, moduleKey: string): Promise<number[]> {
  const m = mustGetModule(moduleKey);
  const rows = await db.selectDistinct({ year: records.periodYear })
    .from(records)
    .where(scopeFilter(actor, m));
  return rows.map((r) => r.year);
}

/** Counts per status for the module header chips — one query, same scope. */
export async function statusCounts(actor: SessionUser, moduleKey: string) {
  const m = mustGetModule(moduleKey);
  const rows = await db
    .select({ status: records.status, n: count() })
    .from(records)
    .where(scopeFilter(actor, m))
    .groupBy(records.status);

  const out: Record<RecordStatus, number> = {
    draft: 0, submitted: 0, verified: 0, approved: 0, returned: 0,
  };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/** Statuses in which points to check concern the verifying office and IQAC (not the owner's drafts). */
const CHECKED_STATUSES = ['submitted', 'verified', 'approved'] as const;

/**
 * Submitted or approved with points to check — details the owner changed or typed, or anything not
 * confirmed automatically: DRIE/IQAC should look at it against the evidence.
 */
function needsCheck(v: RecordVerification | null, status: RecordStatus): boolean {
  return (CHECKED_STATUSES as readonly string[]).includes(status) && (v?.reasons.length ?? 0) > 0;
}

/* ─────────────────────────────── read ─────────────────────────────── */

const AUTHORITATIVE = new Set(['crossref', 'datacite', 'ipindia']);

/**
 * Fields shown locked on the edit form: fetched from an authoritative register, non-empty, and not
 * changed or typed by the owner (those stay open, marked, with the publisher's value beside them).
 */
function lockedFieldsOf(m: ModuleConfig, v: RecordVerification | null, data: Record<string, unknown>): string[] {
  const always = m.fields.filter((f) => f.autofill?.alwaysLocked).map((f) => f.key);
  if (!v?.source || !AUTHORITATIVE.has(v.source)) return always;
  return m.fields
    .filter((f) => f.autofill?.alwaysLocked || (
      f.autofill?.locked && !v.fields?.[f.key] && data[f.key] !== undefined && data[f.key] !== ''
    ))
    .map((f) => f.key);
}

async function recordEditsFor(recordId: string) {
  const rows = await db
    .select({ at: recordEdits.at, note: recordEdits.note, changes: recordEdits.changes, actorName: users.name })
    .from(recordEdits)
    .leftJoin(users, eq(users.id, recordEdits.userId))
    .where(eq(recordEdits.recordId, recordId))
    .orderBy(desc(recordEdits.at), desc(recordEdits.id));
  return rows.map((r) => ({
    at: r.at.toISOString(), note: r.note, changes: r.changes, actorName: r.actorName ?? 'DARP (automatic)',
  }));
}

export async function getRecord(actor: SessionUser, moduleKey: string, id: string) {
  const m = mustGetModule(moduleKey);

  // The scope filter comes first; the id is an additional condition, never the only one.
  const [found] = await db
    .select({ record: records, ownerName: users.name, departmentName: departments.name })
    .from(records)
    .innerJoin(users, eq(users.id, records.ownerUserId))
    .leftJoin(departments, eq(departments.id, records.departmentId))
    .where(and(scopeFilter(actor, m), eq(records.id, id)))
    .limit(1);

  if (!found) throw new ServiceError('NOT_FOUND', 'Record not found.');
  const row = found.record;

  const ownership = { ownerUserId: row.ownerUserId, departmentId: row.departmentId, status: row.status };
  // Defence in depth: re-check the row we actually loaded.
  if (!canReadRecord(actor, m, ownership)) {
    throw new ServiceError('NOT_FOUND', 'Record not found.');
  }

  const mine = row.ownerUserId === actor.id || actor.role === 'admin';
  const canEdit = canEditRecord(actor, m, ownership);

  const history = await db
    .select({
      fromStatus: recordTransitions.fromStatus,
      toStatus: recordTransitions.toStatus,
      remark: recordTransitions.remark,
      at: recordTransitions.at,
      actorRole: recordTransitions.actorRole,
      actorName: users.name,
    })
    .from(recordTransitions)
    .innerJoin(users, eq(users.id, recordTransitions.actorUserId))
    .where(eq(recordTransitions.recordId, id))
    .orderBy(asc(recordTransitions.at));

  return {
    id: row.id,
    status: row.status,
    periodLabel: row.periodLabel,
    periodYear: row.periodYear,
    returnedRemark: row.returnedRemark,
    updatedAt: row.updatedAt,
    ownerUserId: row.ownerUserId,
    ownerName: found.ownerName,
    departmentName: found.departmentName ?? null,
    isMine: row.ownerUserId === actor.id,
    canEdit,
    data: presentForRead(m, row.data as Record<string, unknown>, { includeSensitive: mine }),
    // Only the person who may edit gets the raw values back for the form.
    editValues: canEdit ? presentForEdit(m, row.data as Record<string, unknown>) : null,
    history,
    edits: await recordEditsFor(id),
    canDelete: canDeleteRecord(actor, m, ownership),
    deleteNeedsReason: deleteNeedsReason(actor, ownership),
    returnedByRole: row.status === 'returned' ? (await returnedInfo([id])).get(id)?.role ?? null : null,
    returnedAt: row.status === 'returned' ? (await returnedInfo([id])).get(id)?.at ?? null : null,
    estimatedDates: row.dataNotes?.estimated ?? [],
    needsInput: row.dataNotes?.needsInput ?? [],
    verification: (row.verification as RecordVerification | null) ?? null,
    lockedFields: lockedFieldsOf(m, row.verification as RecordVerification | null, row.data as Record<string, unknown>),
    derived: (await derivedValues(m, [{ key: row.id, data: row.data as Record<string, unknown> }])).get(row.id) ?? {},
  };
}

/* ────────────────────────────── create ────────────────────────────── */

/** Records the system's Submitted → Approved step for an auto-checked record (decision D1). */
async function recordAutoApproval(recordId: string, v: RecordVerification | null) {
  const system = await systemActor();
  const source = v?.source ? LOOKUP_SOURCE_LABEL[v.source] : 'the publisher register';
  await db.insert(recordTransitions).values({
    recordId, fromStatus: 'submitted', toStatus: 'approved',
    actorUserId: system.id, actorRole: system.role,
    remark: !v
      ? 'Approved on submission.'
      : v.reasons.length === 0
      ? `Checked automatically against ${source}: the details match the published record and the owner is named on it.`
      : `Approved automatically on submission. ${v.reasons.length} point${v.reasons.length === 1 ? '' : 's'} for the verifying office or IQAC to check against the evidence: ${v.reasons.join(' ')}`.slice(0, 1000),
  });
  await audit({
    actor: system, action: 'record.transition', entity: 'record', entityId: recordId,
    before: { status: 'submitted' }, after: { status: 'approved' },
    meta: { automatic: true, source: v?.source ?? null, identifier: v?.identifier ?? null },
  });
}

type Looked = Awaited<ReturnType<typeof applyLookup>>;

/**
 * A refusal that says everything on its own, checked on submit before any field rule so that
 * nothing else confuses the message: a work that belongs in another module (a conference paper
 * in Publications, a preprint anywhere). The year never refuses a record.
 */
function refuseOnSubmit(m: ModuleConfig, looked: Looked, mode: 'draft' | 'submit') {
  if (mode !== 'submit' || !m.lookup || !looked.misplaced) return;
  throw new ServiceError('VALIDATION', looked.misplaced.message, { [looked.misplaced.field]: looked.misplaced.message });
}

/**
 * Field errors on submit for a module with a lookup, shown together with the ordinary ones:
 *  - the owner's name must be in the author list (`lookup.ownerMustBeIn`);
 *  - evidence when anything could not be confirmed (`lookup.evidenceField`) — modules whose
 *    evidence field is `required` need it on every record anyway.
 */
function submitErrors(
  m: ModuleConfig, looked: Looked, ownerName: string, mode: 'draft' | 'submit',
): Record<string, string> {
  if (mode !== 'submit' || !m.lookup) return {};
  const errors: Record<string, string> = {};
  const owner = ownerMissingFromAuthors(m, looked.data, ownerName);
  if (owner) errors[owner.field] = owner.message;
  const evidence = evidenceMissing(m, looked.data, looked.verification);
  if (evidence) errors[evidence.field] = evidence.message;
  return errors;
}

/** Field rules and submit rules together, so the owner sees every problem at once. */
async function validateSubmission(
  m: ModuleConfig, looked: Looked, ownerName: string, mode: 'draft' | 'submit',
) {
  refuseOnSubmit(m, looked, mode);
  const v = await validateRecord(m, looked.data, mode);
  const errors = { ...submitErrors(m, looked, ownerName, mode), ...(v.ok ? {} : v.errors) };
  if (!v.ok || Object.keys(errors).length > 0) throw new ServiceError('VALIDATION', 'Some fields need attention.', errors);
  return v;
}

/**
 * Whether a submission is approved at once: always. A record that was returned and is corrected is
 * approved again too, but is flagged for whoever returned it ("Corrected after return") until they
 * acknowledge it, so a return cannot be undone unseen.
 */
function approvesNow(mode: 'draft' | 'submit'): boolean {
  // Every submission, in every module, is approved at once; the verifying office checks afterwards.
  return mode === 'submit';
}

export async function createRecord(
  actor: SessionUser, moduleKey: string, input: Record<string, unknown>, mode: 'draft' | 'submit',
) {
  const m = mustGetModule(moduleKey);
  if (!canCreateIn(actor, m)) throw new ServiceError('FORBIDDEN', 'You cannot add records to this module.');

  const cycle = await activeCycle();
  const looked = await applyLookup(m, input, { ownerName: actor.name });
  const v = await validateSubmission(m, looked, actor.name, mode);

  const departmentId = departmentForRecord(actor, m);
  const badFiles = await unattachableFiles(actor.id, m, null, v.data);
  if (Object.keys(badFiles).length > 0) throw new ServiceError('VALIDATION', 'Some fields need attention.', badFiles);

  const { data, naturalKey, searchText } = prepareForStorage(m, v.data, departmentId);
  const { periodYear, periodLabel, cyYear, fyYear, ayYear } = resolvePeriod(m, v.data, cycle);

  await assertNoDuplicate(m, naturalKey, null);

  const auto = approvesNow(mode);
  const system = auto ? await systemActor() : null;
  const verification = looked.verification ? { ...looked.verification, autoApproved: auto } : null;
  const now = new Date();

  const [created] = await db.insert(records).values({
    moduleKey: m.key,
    ownerUserId: actor.id,
    departmentId,
    status: auto ? 'approved' : mode === 'submit' ? 'submitted' : 'draft',
    submittedAt: mode === 'submit' ? now : null,
    verifiedAt: auto ? now : null,
    verifiedBy: system?.id ?? null,
    approvedAt: auto ? now : null,
    approvedBy: system?.id ?? null,
    periodLabel,
    periodYear,
    cyYear, fyYear, ayYear,
    naturalKey,
    data,
    searchText,
    verification,
    createdBy: actor.id,
    updatedBy: actor.id,
  }).returning({ id: records.id, status: records.status })
    .catch((e) => asConflict(e, m));

  await audit({
    actor, action: 'record.create', entity: 'record', entityId: created!.id,
    after: { moduleKey: m.key, periodLabel, status: created!.status },
  });

  if (mode === 'submit') {
    await db.insert(recordTransitions).values({
      recordId: created!.id, fromStatus: 'draft', toStatus: 'submitted',
      actorUserId: actor.id, actorRole: actor.role,
    });
  }
  await linkEvidence(m, created!.id, data);
  if (auto) await recordAutoApproval(created!.id, verification);

  return { id: created!.id, status: created!.status };
}

/* ────────────────────────────── update ────────────────────────────── */

/** Who last returned this record: the person its correction is flagged for. */
async function lastReturnedBy(recordId: string): Promise<string | null> {
  const [t] = await db.select({ by: recordTransitions.actorUserId }).from(recordTransitions)
    .where(and(eq(recordTransitions.recordId, recordId), eq(recordTransitions.toStatus, 'returned')))
    .orderBy(desc(recordTransitions.at), desc(recordTransitions.id)).limit(1);
  return t?.by ?? null;
}

const asText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v === undefined || v === null ? '' : String(v));

/** Old → new for each field of a saved record that changed; files and protected fields are not shown. */
function diffRecord(
  m: ModuleConfig, before: Record<string, unknown>, after: Record<string, unknown>,
): Array<{ key: string; label: string; from: string; to: string }> {
  const out: Array<{ key: string; label: string; from: string; to: string }> = [];
  for (const f of m.fields) {
    if (f.autofill?.from === 'citation') continue;           // rebuilt from the other fields
    if (asText(before[f.key]) === asText(after[f.key])) continue;
    const hide = f.pii === 'encrypted' || f.sensitive;
    out.push({
      key: f.key, label: f.label,
      from: hide ? 'hidden' : f.type === 'file' ? 'a file' : asText(before[f.key]).slice(0, 300),
      to: hide ? 'changed' : f.type === 'file' ? 'file replaced' : asText(after[f.key]).slice(0, 300),
    });
  }
  return out;
}

export async function updateRecord(
  actor: SessionUser, moduleKey: string, id: string, input: Record<string, unknown>, requestedMode: 'draft' | 'submit',
) {
  const m = mustGetModule(moduleKey);
  const cycle = await activeCycle();

  const [existing] = await db.select().from(records)
    .where(and(scopeFilter(actor, m), eq(records.id, id)))
    .limit(1);
  if (!existing) throw new ServiceError('NOT_FOUND', 'Record not found.');

  const ownership = {
    ownerUserId: existing.ownerUserId, departmentId: existing.departmentId, status: existing.status,
  };
  if (!canEditRecord(actor, m, ownership)) {
    throw new ServiceError('FORBIDDEN', 'You cannot edit this record.');
  }
  // An approved record stays approved: saving it again is a change, not a new submission.
  const wasApproved = existing.status === 'approved';
  const mode = wasApproved ? 'submit' : requestedMode;

  const stored = existing.data as Record<string, unknown>;
  // What was fetched by a number (DOI, patent number) cannot be swapped for another record once the
  // record has left draft: a different work is a new record.
  if (m.lookup && existing.status !== 'draft') {
    const norm = (v: unknown) => asText(v).trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
    for (const k of m.lookup.idFields) {
      if (norm(input[k]) !== '' && norm(input[k]) !== norm(stored[k])) {
        throw new ServiceError('VALIDATION', `The ${m.lookup.idLabel} cannot be changed after submission.`, {
          [k]: `The ${m.lookup.idLabel} cannot be changed after submission. Add the right one as a new record and ask IQAC to remove this one.`,
        });
      }
    }
  }

  const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, existing.ownerUserId));
  const looked = await applyLookup(m, input, { ownerName: owner?.name ?? actor.name });

  const v = await validateSubmission(m, looked, owner?.name ?? actor.name, mode);

  const badFiles = await unattachableFiles(actor.id, m, id, v.data);
  if (Object.keys(badFiles).length > 0) throw new ServiceError('VALIDATION', 'Some fields need attention.', badFiles);

  const prepared = prepareForStorage(m, v.data, existing.departmentId);
  // An encrypted field left blank on the form keeps its stored ciphertext.
  for (const f of m.fields) {
    if (f.pii === 'encrypted' && (prepared.data[f.key] === undefined || prepared.data[f.key] === '')) {
      if (stored[f.key] !== undefined) prepared.data[f.key] = stored[f.key];
    }
  }

  const { periodYear, periodLabel, cyYear, fyYear, ayYear } = resolvePeriod(m, v.data, cycle);
  await assertNoDuplicate(m, prepared.naturalKey, id);

  // A date estimated from a year stays marked until the owner changes it; a value still to enter, until it is entered.
  const notes = {
    estimated: (existing.dataNotes?.estimated ?? []).filter((k) => asText(stored[k]) === asText(prepared.data[k])),
    needsInput: (existing.dataNotes?.needsInput ?? []).filter((k) => asText(prepared.data[k]) === ''),
  };

  // Approved now: a submission of a draft or returned record. Already approved stays approved.
  const auto = !wasApproved && approvesNow(mode);
  const system = auto ? await systemActor() : null;
  const now = new Date();
  const nextStatus: RecordStatus = wasApproved
    ? 'approved'
    : auto ? 'approved' : existing.status === 'returned' ? 'returned' : 'draft';
  const verification = looked.verification
    ? { ...looked.verification, autoApproved: wasApproved ? (existing.verification as RecordVerification | null)?.autoApproved ?? true : auto }
    : (existing.verification as RecordVerification | null);
  const correctionFor = auto && existing.status === 'returned' ? await lastReturnedBy(id) : undefined;

  await db.update(records).set({
    data: prepared.data,
    searchText: prepared.searchText,
    naturalKey: prepared.naturalKey,
    periodYear,
    periodLabel,
    cyYear, fyYear, ayYear,
    status: nextStatus,
    submittedAt: auto ? now : existing.submittedAt,
    returnedRemark: auto ? null : existing.returnedRemark,
    verification,
    dataNotes: notes,
    ...(correctionFor !== undefined ? { correctionForUserId: correctionFor } : {}),
    ...(auto ? { verifiedAt: now, verifiedBy: system!.id, approvedAt: now, approvedBy: system!.id } : {}),
    updatedBy: actor.id,
  }).where(eq(records.id, id)).catch((e) => asConflict(e, m));

  await audit({
    actor, action: 'record.update', entity: 'record', entityId: id,
    before: { status: existing.status, data: existing.data },
    after: { status: nextStatus, data: prepared.data },
  });

  // From the first submission on, every change is kept: who, when, old → new.
  if (existing.status !== 'draft') {
    const changes = diffRecord(m, stored, prepared.data);
    if (changes.length > 0) await db.insert(recordEdits).values({ recordId: id, userId: actor.id, changes });
  }

  if (auto) {
    await db.insert(recordTransitions).values({
      recordId: id, fromStatus: existing.status, toStatus: 'submitted',
      actorUserId: actor.id, actorRole: actor.role,
    });
  }
  await linkEvidence(m, id, prepared.data);
  if (auto) await recordAutoApproval(id, verification);

  return { id, status: nextStatus };
}

/* ────────────────────────────── delete ────────────────────────────── */

export async function deleteRecord(actor: SessionUser, moduleKey: string, id: string, reason?: string) {
  const m = mustGetModule(moduleKey);

  const [existing] = await db.select().from(records)
    .where(and(scopeFilter(actor, m), eq(records.id, id)))
    .limit(1);
  if (!existing) throw new ServiceError('NOT_FOUND', 'Record not found.');

  const ownership = {
    ownerUserId: existing.ownerUserId, departmentId: existing.departmentId, status: existing.status,
  };
  if (!canDeleteRecord(actor, m, ownership)) {
    throw new ServiceError('FORBIDDEN', 'Only the owner or IQAC can delete a record.');
  }
  const why = reason?.trim() ?? '';
  if (deleteNeedsReason(actor, ownership) && (why.length < 5 || why.length > 300)) {
    throw new ServiceError('VALIDATION', 'Say why the record is being deleted (5 to 300 characters).', {
      reason: 'Say why the record is being deleted (5 to 300 characters).',
    });
  }

  await db.update(records)
    .set({ deletedAt: new Date(), deletedBy: actor.id, deleteReason: why || null, naturalKey: null })
    .where(eq(records.id, id));

  await audit({
    actor, action: 'record.delete', entity: 'record', entityId: id,
    before: { data: existing.data, status: existing.status }, meta: { reason: why || null },
  });
  return { id, deleted: true };
}

export interface DeletedRecordRow {
  id: string; moduleKey: string; moduleName: string; title: string; ownerName: string;
  deletedAt: string; deletedByName: string; reason: string | null; status: RecordStatus;
}

/** IQAC only: records taken out of the portal, with who removed them and why. */
export async function listDeletedRecords(actor: SessionUser): Promise<DeletedRecordRow[]> {
  if (actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 'Only IQAC can see deleted records.');
  const rows = await db.select({
    id: records.id, moduleKey: records.moduleKey, data: records.data, status: records.status,
    deletedAt: records.deletedAt, reason: records.deleteReason, deletedBy: records.deletedBy, ownerId: records.ownerUserId,
  }).from(records).where(isNotNull(records.deletedAt)).orderBy(desc(records.deletedAt)).limit(200);
  const ids = [...new Set(rows.flatMap((r) => [r.deletedBy, r.ownerId].filter((x): x is string => !!x)))];
  const names = new Map<string, string>();
  if (ids.length) for (const u of await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))) names.set(u.id, u.name);
  return rows.map((r) => {
    const m = getModule(r.moduleKey);
    const d = r.data as Record<string, unknown>;
    const first = (m?.listColumns ?? []).map((k) => asText(d[k])).find(Boolean) ?? m?.name ?? r.moduleKey;
    return {
      id: r.id, moduleKey: r.moduleKey, moduleName: m?.name ?? r.moduleKey, title: first.slice(0, 120),
      ownerName: names.get(r.ownerId) ?? 'Unknown', deletedAt: r.deletedAt!.toISOString(),
      deletedByName: r.deletedBy ? names.get(r.deletedBy) ?? 'Unknown' : 'Unknown', reason: r.reason, status: r.status,
    };
  });
}

/** IQAC only: brings a deleted record back with the status it had. */
export async function restoreRecord(actor: SessionUser, id: string) {
  if (actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 'Only IQAC can restore a record.');
  const [row] = await db.select().from(records).where(and(eq(records.id, id), isNotNull(records.deletedAt))).limit(1);
  if (!row) throw new ServiceError('NOT_FOUND', 'Deleted record not found.');
  const m = mustGetModule(row.moduleKey);
  const prepared = prepareForStorage(m, row.data as Record<string, unknown>, row.departmentId);
  await assertNoDuplicate(m, prepared.naturalKey, id);
  await db.update(records)
    .set({ deletedAt: null, deletedBy: null, deleteReason: null, naturalKey: prepared.naturalKey, updatedBy: actor.id })
    .where(eq(records.id, id)).catch((e) => asConflict(e, m));
  await audit({ actor, action: 'record.restore', entity: 'record', entityId: id, meta: { module: row.moduleKey } });
  return { id, restored: true };
}

/* ──────────────────────────── transitions ─────────────────────────── */

export async function transitionRecord(
  actor: SessionUser, moduleKey: string, id: string, action: WorkflowAction, remark?: string,
) {
  const m = mustGetModule(moduleKey);

  const [existing] = await db.select().from(records)
    .where(and(scopeFilter(actor, m), eq(records.id, id)))
    .limit(1);
  if (!existing) throw new ServiceError('NOT_FOUND', 'Record not found.');

  const ownership = {
    ownerUserId: existing.ownerUserId, departmentId: existing.departmentId, status: existing.status,
  };
  const decision = canTransition(actor, m, ownership, action);
  if (!decision.allowed || !decision.next) {
    throw new ServiceError('FORBIDDEN', decision.reason ?? 'That action is not allowed.');
  }

  if (action === 'return' && !remark?.trim()) {
    throw new ServiceError('VALIDATION', 'Say why the record is being returned.', {
      remark: 'A remark is required when returning a record.',
    });
  }

  // A module with a lookup has submit rules of its own (name in the author list, evidence,
  // automatic approval): submit through the save path so there is one set of rules, not two.
  if (action === 'submit' && m.lookup) {
    return updateRecord(actor, moduleKey, id, existing.data as Record<string, unknown>, 'submit');
  }

  // Submitting requires a complete record, not just a valid draft.
  if (action === 'submit') {
    const v = await validateRecord(m, existing.data as Record<string, unknown>, 'submit');
    if (!v.ok) {
      throw new ServiceError('VALIDATION', 'Complete the required fields before submitting.', v.errors);
    }
  }

  const now = new Date();
  // Submitting is approving, by the system, as everywhere else; the owner's own step is recorded first.
  const bySystem = action === 'submit' ? await systemActor() : null;
  const returnedBy = action === 'submit' && existing.status === 'returned' ? await lastReturnedBy(id) : null;
  await db.update(records).set({
    status: decision.next,
    submittedAt: action === 'submit' ? now : existing.submittedAt,
    // The database requires a verified record before an approved one: the system does both on submission.
    verifiedAt: action === 'submit' ? now : existing.verifiedAt,
    verifiedBy: action === 'submit' ? bySystem!.id : existing.verifiedBy,
    approvedAt: decision.next === 'approved' ? now : null,
    approvedBy: action === 'submit' ? bySystem!.id : null,
    returnedRemark: decision.next === 'returned' ? remark!.trim().slice(0, 2000) : null,
    // A new return clears the flag; a corrected resubmission flags it for the one who returned it.
    correctionForUserId: action === 'return' ? null : action === 'submit' ? returnedBy : existing.correctionForUserId,
    updatedBy: actor.id,
  }).where(eq(records.id, id));

  if (action === 'submit') {
    await db.insert(recordTransitions).values({
      recordId: id, fromStatus: existing.status, toStatus: 'submitted', actorUserId: actor.id, actorRole: actor.role,
    });
    await db.insert(recordTransitions).values({
      recordId: id, fromStatus: 'submitted', toStatus: 'approved', actorUserId: bySystem!.id, actorRole: bySystem!.role,
      remark: 'Approved on submission.',
    });
    await audit({
      actor, action: 'record.transition', entity: 'record', entityId: id,
      before: { status: existing.status }, after: { status: 'approved' }, meta: { action },
    });
    return { id, status: 'approved' as RecordStatus };
  }

  await db.insert(recordTransitions).values({
    recordId: id,
    fromStatus: existing.status,
    toStatus: decision.next,
    actorUserId: actor.id,
    actorRole: actor.role,
    remark: remark?.trim().slice(0, 2000) ?? null,
  });

  await audit({
    actor, action: 'record.transition', entity: 'record', entityId: id,
    before: { status: existing.status }, after: { status: decision.next },
    meta: { action, remark: remark ?? null },
  });

  return { id, status: decision.next };
}

/* ──────────────── corrections the reviewer has not yet seen ──────────────── */

export interface CorrectionRow {
  id: string; moduleKey: string; moduleName: string; title: string; ownerName: string; correctedAt: string;
  /** Labels of the fields changed since the return; empty when the owner resubmitted without changing anything. */
  changed: string[];
}

/** Records returned by this person and corrected since: theirs to look at again, or to wave through. */
export async function correctionsFor(actor: SessionUser): Promise<CorrectionRow[]> {
  const rows = await db
    .select({
      id: records.id, moduleKey: records.moduleKey, data: records.data, ownerName: users.name, updatedAt: records.updatedAt,
    })
    .from(records)
    .innerJoin(users, eq(users.id, records.ownerUserId))
    .where(and(eq(records.correctionForUserId, actor.id), isNull(records.deletedAt)))
    .orderBy(desc(records.updatedAt))
    .limit(100);
  const ids = rows.map((r) => r.id);
  const returnedAt = new Map<string, Date>();
  const changedBy = new Map<string, Set<string>>();
  if (ids.length > 0) {
    for (const t of await db.select({ id: recordTransitions.recordId, at: recordTransitions.at }).from(recordTransitions)
      .where(and(inArray(recordTransitions.recordId, ids), eq(recordTransitions.toStatus, 'returned')))
      .orderBy(asc(recordTransitions.at))) returnedAt.set(t.id, t.at);
    for (const e of await db.select({ id: recordEdits.recordId, at: recordEdits.at, changes: recordEdits.changes }).from(recordEdits)
      .where(inArray(recordEdits.recordId, ids))) {
      if (e.at <= (returnedAt.get(e.id) ?? new Date(0))) continue;
      const set = changedBy.get(e.id) ?? new Set<string>();
      for (const c of e.changes) set.add(c.label);
      changedBy.set(e.id, set);
    }
  }
  return rows.map((r) => {
    const m = mustGetModule(r.moduleKey);
    const d = r.data as Record<string, unknown>;
    const first = m.listColumns.map((k) => asText(d[k])).find(Boolean) ?? m.name;
    return {
      id: r.id, moduleKey: r.moduleKey, moduleName: m.name, title: first.slice(0, 120),
      ownerName: r.ownerName, correctedAt: r.updatedAt.toISOString(), changed: [...(changedBy.get(r.id) ?? [])],
    };
  });
}

/** "Looks fine": the returner has seen the correction. Only the person it is flagged for, or IQAC. */
export async function acknowledgeCorrection(actor: SessionUser, moduleKey: string, id: string) {
  const m = mustGetModule(moduleKey);
  const [existing] = await db.select({ flagged: records.correctionForUserId }).from(records)
    .where(and(scopeFilter(actor, m), eq(records.id, id))).limit(1);
  if (!existing) throw new ServiceError('NOT_FOUND', 'Record not found.');
  if (existing.flagged !== actor.id && actor.role !== 'admin') {
    throw new ServiceError('FORBIDDEN', 'This correction was not flagged for you.');
  }
  await db.update(records).set({ correctionForUserId: null }).where(eq(records.id, id));
  await audit({ actor, action: 'record.transition', entity: 'record', entityId: id, meta: { action: 'acknowledgeCorrection' } });
  return { id };
}

/* ───────────────────── the audited PII reveal ─────────────────────── */

export interface RevealTarget {
  recordId: string;
  ownerUserId: string;
  ownerName: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  /** Still encrypted. The caller decrypts only after writing its audit entry. */
  ciphertext: string;
}

/**
 * Loads one encrypted field so the admin reveal route can decrypt it.
 *
 * This lives in the service layer because it is the only place allowed to query
 * `records` — a route doing its own query would bypass scopeFilter one day. It
 * returns the ciphertext rather than the plaintext so that the caller is forced
 * to write its `pii.reveal` audit entry before decrypting.
 */
export async function getEncryptedFieldForReveal(
  actor: SessionUser, moduleKey: string, recordId: string, fieldKey: string,
): Promise<RevealTarget> {
  if (actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 'Only IQAC may reveal a protected value.');

  const m = mustGetModule(moduleKey);
  const field = m.fields.find((f) => f.key === fieldKey);
  // Not a reveal-able field: say nothing about why.
  if (!field || field.pii !== 'encrypted') throw new ServiceError('NOT_FOUND', 'Not found.');

  const [found] = await db
    .select({ record: records, ownerName: users.name })
    .from(records)
    .innerJoin(users, eq(users.id, records.ownerUserId))
    .where(and(scopeFilter(actor, m), eq(records.id, recordId)))
    .limit(1);

  if (!found) throw new ServiceError('NOT_FOUND', 'Not found.');
  const row = found.record;

  // Defence in depth: re-check the row actually loaded.
  if (!canReadRecord(actor, m, {
    ownerUserId: row.ownerUserId, departmentId: row.departmentId, status: row.status,
  })) {
    throw new ServiceError('NOT_FOUND', 'Not found.');
  }

  const stored = (row.data as Record<string, unknown>)[fieldKey];
  if (typeof stored !== 'string' || stored === '') throw new ServiceError('NOT_FOUND', 'Not found.');

  return {
    recordId: row.id,
    ownerUserId: row.ownerUserId,
    ownerName: found.ownerName,
    fieldKey,
    fieldLabel: field.label,
    fieldType: field.type,
    ciphertext: stored,
  };
}

/* ─────────────── nil returns ("nothing to report for a year") ─────────────── */

/** The years someone may declare "nothing to report" for: the default range's years, newest first. */
export async function declarableYears(): Promise<number[]> {
  const r = await defaultRange();
  const out: number[] = [];
  for (let y = r.to; y >= r.from; y--) out.push(y);
  return out;
}

export async function setNilDeclaration(actor: SessionUser, moduleKey: string, declared: boolean, year?: number) {
  const m = mustGetModule(moduleKey);
  if (!canCreateIn(actor, m)) throw new ServiceError('FORBIDDEN', 'This module is not yours to declare.');
  // A one-per-owner module (the Faculty Profile) is filled in, never declared empty.
  if (m.managedAt) throw new ServiceError('VALIDATION', 'This module cannot be declared empty.');
  const periodYear = year ?? (await defaultRange()).to;
  if (!Number.isInteger(periodYear) || periodYear < 1990 || periodYear > 2100) {
    throw new ServiceError('VALIDATION', 'Choose a year between 1990 and 2100.');
  }

  if (declared) {
    await db.insert(moduleDeclarations)
      .values({ moduleKey: m.key, periodYear, userId: actor.id, declaredNil: true })
      .onConflictDoUpdate({
        target: [moduleDeclarations.userId, moduleDeclarations.moduleKey, moduleDeclarations.periodYear],
        set: { declaredNil: true, declaredAt: new Date() },
      });
  } else {
    await db.delete(moduleDeclarations).where(and(
      eq(moduleDeclarations.moduleKey, m.key),
      eq(moduleDeclarations.periodYear, periodYear),
      eq(moduleDeclarations.userId, actor.id),
    ));
  }

  await audit({
    actor, action: 'declaration.update', entity: 'declaration', entityId: m.key,
    after: { declaredNil: declared, year: periodYear },
  });
  return { moduleKey: m.key, declaredNil: declared, year: periodYear };
}

/** The years this person declared "nothing to report" for in a module. */
export async function getNilDeclarations(actor: SessionUser, moduleKey: string): Promise<number[]> {
  const rows = await db.select({ y: moduleDeclarations.periodYear }).from(moduleDeclarations).where(and(
    eq(moduleDeclarations.moduleKey, moduleKey),
    eq(moduleDeclarations.userId, actor.id),
    eq(moduleDeclarations.declaredNil, true),
  ));
  return rows.map((r) => r.y).sort((a, b) => b - a);
}

/* ─────────────────────────────── helpers ──────────────────────────── */

function departmentForRecord(actor: SessionUser, m: ModuleConfig): string | null {
  if (m.scope === 'institute') return null;
  return actor.departmentId;     // faculty and HOD accounts always have one (DB constraint)
}

async function assertNoDuplicate(
  m: ModuleConfig, naturalKey: string | null, excludeId: string | null,
) {
  if (!naturalKey) return;
  const rows = await db.select({ id: records.id, owner: users.name })
    .from(records)
    .innerJoin(users, eq(users.id, records.ownerUserId))
    .where(and(
      eq(records.moduleKey, m.key),
      eq(records.naturalKey, naturalKey),
      isNull(records.deletedAt),
    ))
    .limit(1);

  const hit = rows[0];
  if (hit && hit.id !== excludeId) {
    const keyLabel = m.naturalKey?.join(' + ') ?? 'value';
    throw new ServiceError(
      'CONFLICT',
      `This ${keyLabel} is already recorded (entered by ${hit.owner}). Each item is entered once — ask them to add you instead of creating a second copy.`,
      Object.fromEntries((m.naturalKey ?? []).map((k) => [k, 'Already recorded.'])),
    );
  }
}
