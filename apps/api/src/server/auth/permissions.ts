import type { ModuleConfig, Role, RecordStatus } from '@darp/shared/modules/types';
import type { SessionUser } from './session';

/** What a role may do institute-wide, independent of any module. */
export const ROLE_CAPABILITIES = {
  // A faculty member may download their own Faculty workbook: every export query runs through
  // scopeFilter(), which gives a faculty member their own records only.
  faculty: { manageUsers: false, manageLists: false, manageCycle: false, viewAudit: false, export: true, revealPii: false },
  // A head of department may export the HOD workbook. It is safe because every export
  // query runs through scopeFilter(), which limits a HOD to their own department.
  hod: { manageUsers: false, manageLists: false, manageCycle: false, viewAudit: false, export: true, revealPii: false },
  dofa: { manageUsers: false, manageLists: false, manageCycle: false, viewAudit: false, export: true, revealPii: false },
  drie: { manageUsers: false, manageLists: false, manageCycle: false, viewAudit: false, export: true, revealPii: false },
  dugs: { manageUsers: false, manageLists: false, manageCycle: false, viewAudit: false, export: true, revealPii: false },
  cdc: { manageUsers: false, manageLists: false, manageCycle: false, viewAudit: false, export: true, revealPii: false },
  admin: { manageUsers: true, manageLists: true, manageCycle: true, viewAudit: true, export: true, revealPii: true },
} as const satisfies Record<Role, Record<string, boolean>>;

export type Capability = keyof (typeof ROLE_CAPABILITIES)['admin'];

export function hasCapability(actor: SessionUser, cap: Capability): boolean {
  return ROLE_CAPABILITIES[actor.role][cap];
}

/* ── module-level permissions ─────────────────────────────────────── */

export function canViewModule(actor: SessionUser, m: ModuleConfig): boolean {
  if (actor.role === 'admin') return true;
  return m.ownerRoles.includes(actor.role)
    || m.verifierRoles.includes(actor.role)
    || m.viewRoles.includes(actor.role);
}

export function canCreateIn(actor: SessionUser, m: ModuleConfig): boolean {
  if (actor.role === 'admin') return true;
  return m.ownerRoles.includes(actor.role);
}

export function canVerify(actor: SessionUser, m: ModuleConfig): boolean {
  return actor.role === 'admin' || m.verifierRoles.includes(actor.role);
}

/**
 * Every module approves a record when its owner submits it; the verifying office and IQAC check
 * afterwards and may return an approved record with a remark. Kept as a function so callers say why.
 */
export function returnsAfterApproval(_m: ModuleConfig): boolean {
  return true;
}

/* ── record-level permissions ─────────────────────────────────────── */

export interface RecordOwnership {
  ownerUserId: string;
  departmentId: string | null;
  status: RecordStatus;
}

/**
 * Read: owner always; a HOD their department's records; verifier/viewer roles the module's records
 * (a faculty viewer of a department module only their own department's); admin everything.
 */
export function canReadRecord(actor: SessionUser, m: ModuleConfig, r: RecordOwnership): boolean {
  if (actor.role === 'admin') return true;
  if (r.ownerUserId === actor.id) return true;
  if (actor.role === 'hod') {
    return !!actor.departmentId && r.departmentId === actor.departmentId && canViewModule(actor, m);
  }
  if (actor.role === 'faculty' && m.scope === 'department') {
    return !!actor.departmentId && r.departmentId === actor.departmentId && m.viewRoles.includes('faculty');
  }
  // Office roles (dofa/drie/dugs/cdc) see their own modules across all departments.
  if (m.verifierRoles.includes(actor.role) || m.viewRoles.includes(actor.role)) return true;
  return false;
}

/** Edit: the owner at any time, even after approval (every change is kept in the record's history). Admin too. */
export function canEditRecord(actor: SessionUser, _m: ModuleConfig, r: RecordOwnership): boolean {
  return actor.role === 'admin' || r.ownerUserId === actor.id;
}

/** Delete: the owner at any status, IQAC any record. Soft only, and it can be restored. */
export function canDeleteRecord(actor: SessionUser, _m: ModuleConfig, r: RecordOwnership): boolean {
  return actor.role === 'admin' || r.ownerUserId === actor.id;
}

/** A reason is written down when an approved record goes, and whenever IQAC removes someone else's. */
export function deleteNeedsReason(actor: SessionUser, r: RecordOwnership): boolean {
  return r.status === 'approved' || r.ownerUserId !== actor.id;
}

/** Transitions: records are approved on submission, so the only steps are submit and return. */
export type WorkflowAction = 'submit' | 'return';

export function canTransition(
  actor: SessionUser, m: ModuleConfig, r: RecordOwnership, action: WorkflowAction,
): { allowed: boolean; next: RecordStatus | null; reason?: string } {
  const isOwner = r.ownerUserId === actor.id;
  switch (action) {
    case 'submit':
      if (!(r.status === 'draft' || r.status === 'returned')) {
        return { allowed: false, next: null, reason: 'Only a draft or returned record can be submitted.' };
      }
      if (!isOwner && actor.role !== 'admin') {
        return { allowed: false, next: null, reason: 'Only the owner may submit.' };
      }
      // Approved on submission, in every module.
      return { allowed: true, next: 'approved' };
    case 'return':
      if (!(r.status === 'submitted' || r.status === 'verified' || r.status === 'approved')) {
        return { allowed: false, next: null, reason: 'Only an approved record can be returned.' };
      }
      // Nobody returns their own record, a HOD's own profile included.
      if (isOwner) {
        return { allowed: false, next: null, reason: 'You cannot return your own record.' };
      }
      // A head of department checks their own department's records afterwards, too.
      if (actor.role === 'hod' && actor.departmentId && r.departmentId === actor.departmentId && canViewModule(actor, m)) {
        return { allowed: true, next: 'returned' };
      }
      if (!canVerify(actor, m)) {
        return { allowed: false, next: null, reason: 'Your role cannot return this record.' };
      }
      return { allowed: true, next: 'returned' };
    default:
      return { allowed: false, next: null, reason: 'Unknown action.' };
  }
}
