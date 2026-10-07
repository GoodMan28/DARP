import type { ModuleConfig, Role, RecordStatus } from '@darp/shared/modules/types';
import type { SessionUser } from './session';

/** What a role may do institute-wide, independent of any module. */
export const ROLE_CAPABILITIES = {
  faculty: { manageUsers: false, manageLists: false, manageCycle: false, viewAudit: false, export: false, revealPii: false },
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

/** Modules approved on submission are checked afterwards, so an approved record can be returned. */
export function returnsAfterApproval(m: ModuleConfig): boolean {
  return m.lookup?.autoApprove === 'always';
}

export function canApprove(actor: SessionUser): boolean {
  return actor.role === 'admin';
}

/* ── record-level permissions ─────────────────────────────────────── */

export interface RecordOwnership {
  ownerUserId: string;
  departmentId: string | null;
  status: RecordStatus;
}

/** Read: owner always; department for HOD; verifier/viewer roles; admin everything. */
export function canReadRecord(actor: SessionUser, m: ModuleConfig, r: RecordOwnership): boolean {
  if (actor.role === 'admin') return true;
  if (r.ownerUserId === actor.id) return true;
  if (actor.role === 'hod') {
    return !!actor.departmentId && r.departmentId === actor.departmentId && canViewModule(actor, m);
  }
  // Office roles (dofa/drie/dugs/cdc) see their own modules across all departments.
  if (m.verifierRoles.includes(actor.role) || m.viewRoles.includes(actor.role)) return true;
  return false;
}

/** Edit: only the owner, and only while the record is open. Admin may always edit (audited). */
export function canEditRecord(actor: SessionUser, m: ModuleConfig, r: RecordOwnership): boolean {
  if (actor.role === 'admin') return true;
  if (r.ownerUserId !== actor.id) return false;
  return r.status === 'draft' || r.status === 'returned';
}

/** Delete: same as edit, and soft only. */
export function canDeleteRecord(actor: SessionUser, m: ModuleConfig, r: RecordOwnership): boolean {
  return canEditRecord(actor, m, r);
}

/** Transitions — the single source of truth for the workflow in 00 §0.8. */
export type WorkflowAction = 'submit' | 'verify' | 'return' | 'approve' | 'unlock';

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
      return { allowed: true, next: 'submitted' };
    case 'verify':
      if (r.status !== 'submitted') {
        return { allowed: false, next: null, reason: 'Only a submitted record can be verified.' };
      }
      if (!canVerify(actor, m)) {
        return { allowed: false, next: null, reason: 'Your role cannot verify this module.' };
      }
      // Where submissions are approved automatically (Publications), a record only reaches the
      // office after being returned and resubmitted; the office's check is then final, so IQAC
      // never has to approve publications. IQAC can still return an approved one.
      return { allowed: true, next: returnsAfterApproval(m) ? 'approved' : 'verified' };
    case 'return':
      // Where submissions are approved automatically, checking happens afterwards: the verifying
      // office and IQAC may send an approved record back to its owner.
      if (!(r.status === 'submitted' || r.status === 'verified'
        || (r.status === 'approved' && returnsAfterApproval(m)))) {
        return { allowed: false, next: null, reason: 'Only a submitted or verified record can be returned.' };
      }
      if (!canVerify(actor, m)) {
        return { allowed: false, next: null, reason: 'Your role cannot return this record.' };
      }
      return { allowed: true, next: 'returned' };
    case 'approve':
      if (r.status !== 'verified') {
        return { allowed: false, next: null, reason: 'Only a verified record can be approved.' };
      }
      if (!canApprove(actor)) {
        return { allowed: false, next: null, reason: 'Only IQAC may approve.' };
      }
      return { allowed: true, next: 'approved' };
    case 'unlock':
      if (r.status !== 'approved') {
        return { allowed: false, next: null, reason: 'Only an approved record can be unlocked.' };
      }
      if (!canApprove(actor)) {
        return { allowed: false, next: null, reason: 'Only IQAC may unlock.' };
      }
      return { allowed: true, next: 'verified' };
    default:
      return { allowed: false, next: null, reason: 'Unknown action.' };
  }
}
