import { and, asc, desc, eq, inArray, isNull, sql, count } from 'drizzle-orm';
import { db } from '@/server/db';
import { records, recordTransitions, cycles, users, departments, moduleDeclarations } from '@/server/db/schema';
import { getModule } from '@darp/shared/modules';
import type { ModuleConfig, RecordStatus } from '@darp/shared/modules/types';
import type { SessionUser } from '@/server/auth/session';
import { scopeFilter } from './scope';
import {
  canCreateIn, canReadRecord, canEditRecord, canDeleteRecord, canTransition, type WorkflowAction,
} from '@/server/auth/permissions';
import { validateRecord } from './validate';
import { prepareForStorage, presentForRead, presentForEdit } from './prepare';
import { resolvePeriod, type CycleWindows } from './periods';
import { audit } from '@/server/audit/log';
import { applyLookup, ownerMissingFromAuthors, evidenceMissing, outsideCycle } from '@/server/lookup/apply';
import { unattachableFiles, linkEvidence } from './evidenceLinks';
import { systemActor } from '@/server/lookup/system';
import { LOOKUP_SOURCE_LABEL, type RecordVerification } from '@darp/shared/contracts';

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

export async function activeCycle(): Promise<CycleWindows> {
  const [c] = await db.select().from(cycles).where(eq(cycles.isActive, true)).limit(1);
  if (!c) throw new ServiceError('VALIDATION', 'No active reporting cycle has been configured.');
  return {
    id: c.id,
    cyStart: c.cyStart, cyEnd: c.cyEnd,
    fyStart: c.fyStart, fyEnd: c.fyEnd,
    ayStart: c.ayStart, ayEnd: c.ayEnd,
  };
}

/* ─────────────────────────────── list ─────────────────────────────── */

export interface ListParams {
  q?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  status?: RecordStatus;
  periodYear?: number;
  /** Only records with points for the verifying office or IQAC to check (see needsCheck). */
  check?: boolean;
}

export async function listRecords(actor: SessionUser, moduleKey: string, params: ListParams) {
  const m = mustGetModule(moduleKey);
  const cycle = await activeCycle();

  let where = scopeFilter(actor, m, cycle.id);
  if (params.status) where = and(where, eq(records.status, params.status))!;
  if (params.periodYear) where = and(where, eq(records.periodYear, params.periodYear))!;
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
  const sortable = new Set(m.listColumns);
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
    })),
  };
}

/** Counts per status for the module header chips — one query, same scope. */
export async function statusCounts(actor: SessionUser, moduleKey: string) {
  const m = mustGetModule(moduleKey);
  const cycle = await activeCycle();
  const rows = await db
    .select({ status: records.status, n: count() })
    .from(records)
    .where(scopeFilter(actor, m, cycle.id))
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

const AUTHORITATIVE = new Set(['crossref', 'datacite']);

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

export async function getRecord(actor: SessionUser, moduleKey: string, id: string) {
  const m = mustGetModule(moduleKey);
  const cycle = await activeCycle();

  // The scope filter comes first; the id is an additional condition, never the only one.
  const [found] = await db
    .select({ record: records, ownerName: users.name, departmentName: departments.name })
    .from(records)
    .innerJoin(users, eq(users.id, records.ownerUserId))
    .leftJoin(departments, eq(departments.id, records.departmentId))
    .where(and(scopeFilter(actor, m, cycle.id), eq(records.id, id)))
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
    verification: (row.verification as RecordVerification | null) ?? null,
    lockedFields: lockedFieldsOf(m, row.verification as RecordVerification | null, row.data as Record<string, unknown>),
  };
}

/* ────────────────────────────── create ────────────────────────────── */

/** Records the system's Submitted → Approved step for an auto-checked record (decision D1). */
async function recordAutoApproval(recordId: string, v: RecordVerification) {
  const system = await systemActor();
  const source = v.source ? LOOKUP_SOURCE_LABEL[v.source] : 'the publisher register';
  await db.insert(recordTransitions).values({
    recordId, fromStatus: 'submitted', toStatus: 'approved',
    actorUserId: system.id, actorRole: system.role,
    remark: v.reasons.length === 0
      ? `Checked automatically against ${source}: the details match the published record and the owner is named on it.`
      : `Approved automatically on submission. ${v.reasons.length} point${v.reasons.length === 1 ? '' : 's'} for the verifying office or IQAC to check against the evidence: ${v.reasons.join(' ')}`.slice(0, 1000),
  });
  await audit({
    actor: system, action: 'record.transition', entity: 'record', entityId: recordId,
    before: { status: 'submitted' }, after: { status: 'approved' },
    meta: { automatic: true, source: v.source, identifier: v.identifier },
  });
}

type Looked = Awaited<ReturnType<typeof applyLookup>>;

/**
 * Refusals that say everything on their own, checked on submit before any field rule so that
 * nothing else confuses the message: a work that belongs in another module (a conference paper
 * in Publications, a preprint anywhere), and one from outside the cycle by the publisher's year.
 */
function refuseOnSubmit(m: ModuleConfig, looked: Looked, mode: 'draft' | 'submit', cycle: CycleWindows) {
  if (mode !== 'submit' || !m.lookup) return;
  if (looked.misplaced) {
    throw new ServiceError('VALIDATION', looked.misplaced.message, { [looked.misplaced.field]: looked.misplaced.message });
  }
  const outside = outsideCycle(m, looked.data, cycle, looked.fetched);
  if (outside) throw new ServiceError('VALIDATION', outside.message, { [outside.field]: outside.message });
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
  m: ModuleConfig, looked: Looked, ownerName: string, mode: 'draft' | 'submit', cycle: CycleWindows,
) {
  refuseOnSubmit(m, looked, mode, cycle);
  const v = await validateRecord(m, looked.data, mode);
  const errors = { ...submitErrors(m, looked, ownerName, mode), ...(v.ok ? {} : v.errors) };
  if (!v.ok || Object.keys(errors).length > 0) throw new ServiceError('VALIDATION', 'Some fields need attention.', errors);
  return v;
}

/**
 * Whether a submission is approved at once. `autoApprove: 'always'` approves every submission;
 * 'whenChecksPass' only a fully confirmed one. A record the verifying office returned goes back
 * to that office when resubmitted, never straight to Approved again — otherwise a return could
 * simply be undone by resubmitting.
 */
function approvesNow(m: ModuleConfig, looked: Looked, mode: 'draft' | 'submit', previousStatus?: RecordStatus): boolean {
  if (mode !== 'submit' || !m.lookup || previousStatus === 'returned') return false;
  return m.lookup.autoApprove === 'always' || looked.eligible;
}

export async function createRecord(
  actor: SessionUser, moduleKey: string, input: Record<string, unknown>, mode: 'draft' | 'submit',
) {
  const m = mustGetModule(moduleKey);
  if (!canCreateIn(actor, m)) throw new ServiceError('FORBIDDEN', 'You cannot add records to this module.');

  const cycle = await activeCycle();
  const looked = await applyLookup(m, input, { ownerName: actor.name, cycle });
  const v = await validateSubmission(m, looked, actor.name, mode, cycle);

  const departmentId = departmentForRecord(actor, m);
  const badFiles = await unattachableFiles(actor.id, m, null, v.data);
  if (Object.keys(badFiles).length > 0) throw new ServiceError('VALIDATION', 'Some fields need attention.', badFiles);

  const { data, naturalKey, searchText } = prepareForStorage(m, v.data, departmentId);
  const { periodYear, periodLabel } = resolvePeriod(m, v.data, cycle);

  await assertNoDuplicate(m, cycle.id, naturalKey, null);

  const auto = approvesNow(m, looked, mode);
  const system = auto ? await systemActor() : null;
  const verification = looked.verification ? { ...looked.verification, autoApproved: auto } : null;
  const now = new Date();

  const [created] = await db.insert(records).values({
    moduleKey: m.key,
    cycleId: cycle.id,
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
  if (auto && verification) await recordAutoApproval(created!.id, verification);

  return { id: created!.id, status: created!.status };
}

/* ────────────────────────────── update ────────────────────────────── */

export async function updateRecord(
  actor: SessionUser, moduleKey: string, id: string, input: Record<string, unknown>, mode: 'draft' | 'submit',
) {
  const m = mustGetModule(moduleKey);
  const cycle = await activeCycle();

  const [existing] = await db.select().from(records)
    .where(and(scopeFilter(actor, m, cycle.id), eq(records.id, id)))
    .limit(1);
  if (!existing) throw new ServiceError('NOT_FOUND', 'Record not found.');

  const ownership = {
    ownerUserId: existing.ownerUserId, departmentId: existing.departmentId, status: existing.status,
  };
  if (!canEditRecord(actor, m, ownership)) {
    throw new ServiceError(
      'FORBIDDEN',
      'This record can no longer be edited. Ask the verifying office to return it to you.',
    );
  }

  const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, existing.ownerUserId));
  const looked = await applyLookup(m, input, { ownerName: owner?.name ?? actor.name, cycle });

  const v = await validateSubmission(m, looked, owner?.name ?? actor.name, mode, cycle);

  const badFiles = await unattachableFiles(actor.id, m, id, v.data);
  if (Object.keys(badFiles).length > 0) throw new ServiceError('VALIDATION', 'Some fields need attention.', badFiles);

  const prepared = prepareForStorage(m, v.data, existing.departmentId);
  // An encrypted field left blank on the form keeps its stored ciphertext.
  const stored = existing.data as Record<string, unknown>;
  for (const f of m.fields) {
    if (f.pii === 'encrypted' && (prepared.data[f.key] === undefined || prepared.data[f.key] === '')) {
      if (stored[f.key] !== undefined) prepared.data[f.key] = stored[f.key];
    }
  }

  const { periodYear, periodLabel } = resolvePeriod(m, v.data, cycle);
  await assertNoDuplicate(m, cycle.id, prepared.naturalKey, id);

  const auto = approvesNow(m, looked, mode, existing.status);
  const system = auto ? await systemActor() : null;
  const now = new Date();
  const nextStatus: RecordStatus = auto
    ? 'approved'
    : mode === 'submit' ? 'submitted' : existing.status === 'returned' ? 'returned' : 'draft';
  const verification = looked.verification
    ? { ...looked.verification, autoApproved: auto }
    : (existing.verification as RecordVerification | null);

  await db.update(records).set({
    data: prepared.data,
    searchText: prepared.searchText,
    naturalKey: prepared.naturalKey,
    periodYear,
    periodLabel,
    status: nextStatus,
    submittedAt: mode === 'submit' ? now : existing.submittedAt,
    returnedRemark: mode === 'submit' ? null : existing.returnedRemark,
    verification,
    ...(auto ? { verifiedAt: now, verifiedBy: system!.id, approvedAt: now, approvedBy: system!.id } : {}),
    updatedBy: actor.id,
  }).where(eq(records.id, id)).catch((e) => asConflict(e, m));

  await audit({
    actor, action: 'record.update', entity: 'record', entityId: id,
    before: { status: existing.status, data: existing.data },
    after: { status: nextStatus, data: prepared.data },
  });

  if (mode === 'submit' && existing.status !== 'submitted') {
    await db.insert(recordTransitions).values({
      recordId: id, fromStatus: existing.status, toStatus: 'submitted',
      actorUserId: actor.id, actorRole: actor.role,
    });
  }
  await linkEvidence(m, id, prepared.data);
  if (auto && verification) await recordAutoApproval(id, verification);

  return { id, status: nextStatus };
}

/* ────────────────────────────── delete ────────────────────────────── */

export async function deleteRecord(actor: SessionUser, moduleKey: string, id: string) {
  const m = mustGetModule(moduleKey);
  const cycle = await activeCycle();

  const [existing] = await db.select().from(records)
    .where(and(scopeFilter(actor, m, cycle.id), eq(records.id, id)))
    .limit(1);
  if (!existing) throw new ServiceError('NOT_FOUND', 'Record not found.');

  if (!canDeleteRecord(actor, m, {
    ownerUserId: existing.ownerUserId, departmentId: existing.departmentId, status: existing.status,
  })) {
    throw new ServiceError('FORBIDDEN', 'Only a draft or returned record can be deleted.');
  }

  await db.update(records)
    .set({ deletedAt: new Date(), deletedBy: actor.id, naturalKey: null })
    .where(eq(records.id, id));

  await audit({
    actor, action: 'record.delete', entity: 'record', entityId: id,
    before: { data: existing.data, status: existing.status },
  });
  return { id, deleted: true };
}

/* ──────────────────────────── transitions ─────────────────────────── */

export async function transitionRecord(
  actor: SessionUser, moduleKey: string, id: string, action: WorkflowAction, remark?: string,
) {
  const m = mustGetModule(moduleKey);
  const cycle = await activeCycle();

  const [existing] = await db.select().from(records)
    .where(and(scopeFilter(actor, m, cycle.id), eq(records.id, id)))
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
  await db.update(records).set({
    status: decision.next,
    submittedAt: decision.next === 'submitted' ? now : existing.submittedAt,
    // A verification that is final (Publications) moves straight to approved: it is still a
    // verification, and the database requires a verified record before an approved one.
    verifiedAt: decision.next === 'verified' || action === 'verify' ? now : existing.verifiedAt,
    verifiedBy: decision.next === 'verified' || action === 'verify' ? actor.id : existing.verifiedBy,
    approvedAt: decision.next === 'approved' ? now : null,
    approvedBy: decision.next === 'approved' ? actor.id : null,
    returnedRemark: decision.next === 'returned' ? remark!.trim().slice(0, 1000) : null,
    updatedBy: actor.id,
  }).where(eq(records.id, id));

  await db.insert(recordTransitions).values({
    recordId: id,
    fromStatus: existing.status,
    toStatus: decision.next,
    actorUserId: actor.id,
    actorRole: actor.role,
    remark: remark?.trim().slice(0, 1000) ?? null,
  });

  await audit({
    actor, action: 'record.transition', entity: 'record', entityId: id,
    before: { status: existing.status }, after: { status: decision.next },
    meta: { action, remark: remark ?? null },
  });

  return { id, status: decision.next };
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

  const cycle = await activeCycle();
  const [found] = await db
    .select({ record: records, ownerName: users.name })
    .from(records)
    .innerJoin(users, eq(users.id, records.ownerUserId))
    .where(and(scopeFilter(actor, m, cycle.id), eq(records.id, recordId)))
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

/* ─────────────── nil returns ("nothing to report this cycle") ─────────────── */

export async function setNilDeclaration(actor: SessionUser, moduleKey: string, declared: boolean) {
  const m = mustGetModule(moduleKey);
  if (!canCreateIn(actor, m)) throw new ServiceError('FORBIDDEN', 'This module is not yours to declare.');
  // A one-per-owner module (the Faculty Profile) is filled in, never declared empty.
  if (m.managedAt) throw new ServiceError('VALIDATION', 'This module cannot be declared empty.');
  const cycle = await activeCycle();

  if (declared) {
    await db.insert(moduleDeclarations)
      .values({ moduleKey: m.key, cycleId: cycle.id, userId: actor.id, declaredNil: true })
      .onConflictDoUpdate({
        target: [moduleDeclarations.moduleKey, moduleDeclarations.cycleId, moduleDeclarations.userId],
        set: { declaredNil: true, declaredAt: new Date() },
      });
  } else {
    await db.delete(moduleDeclarations).where(and(
      eq(moduleDeclarations.moduleKey, m.key),
      eq(moduleDeclarations.cycleId, cycle.id),
      eq(moduleDeclarations.userId, actor.id),
    ));
  }

  await audit({
    actor, action: 'declaration.update', entity: 'declaration', entityId: m.key,
    after: { declaredNil: declared },
  });
  return { moduleKey: m.key, declaredNil: declared };
}

export async function getNilDeclaration(actor: SessionUser, moduleKey: string): Promise<boolean> {
  const cycle = await activeCycle();
  const [row] = await db.select().from(moduleDeclarations).where(and(
    eq(moduleDeclarations.moduleKey, moduleKey),
    eq(moduleDeclarations.cycleId, cycle.id),
    eq(moduleDeclarations.userId, actor.id),
  )).limit(1);
  return !!row?.declaredNil;
}

/* ─────────────────────────────── helpers ──────────────────────────── */

function departmentForRecord(actor: SessionUser, m: ModuleConfig): string | null {
  if (m.scope === 'institute') return null;
  return actor.departmentId;     // faculty and HOD accounts always have one (DB constraint)
}

async function assertNoDuplicate(
  m: ModuleConfig, cycleId: string, naturalKey: string | null, excludeId: string | null,
) {
  if (!naturalKey) return;
  const rows = await db.select({ id: records.id, owner: users.name })
    .from(records)
    .innerJoin(users, eq(users.id, records.ownerUserId))
    .where(and(
      eq(records.moduleKey, m.key),
      eq(records.cycleId, cycleId),
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
      Object.fromEntries((m.naturalKey ?? []).map((k) => [k, 'Already recorded in this cycle.'])),
    );
  }
}
