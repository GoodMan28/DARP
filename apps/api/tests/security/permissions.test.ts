import { describe, it, expect } from 'vitest';
import {
  canReadRecord, canEditRecord, canDeleteRecord, deleteNeedsReason, canTransition, canCreateIn,
  canVerify, canViewModule, hasCapability,
} from '@/server/auth/permissions';
import type { SessionUser } from '@/server/auth/session';
import { MODULES, MODULE_LIST } from '@darp/shared/modules';

const mod = MODULES.publications!;

const user = (over: Partial<SessionUser>): SessionUser => ({
  id: 'u1', email: 'a@b.c', name: 'A', role: 'faculty', departmentId: 'd1',
  departmentName: 'CSE', departmentCode: 'CSE', dateOfJoining: null,
  mustChangePassword: false, sessionId: 's', ...over,
});

const rec = (over = {}) => ({ ownerUserId: 'u1', departmentId: 'd1', status: 'draft' as const, ...over });

describe('record visibility', () => {
  it('lets a faculty member read only their own records', () => {
    expect(canReadRecord(user({}), mod, rec())).toBe(true);
    expect(canReadRecord(user({ id: 'u2' }), mod, rec())).toBe(false);
  });

  it('lets an HOD read their own department only', () => {
    const hod = user({ id: 'h1', role: 'hod', departmentId: 'd1' });
    expect(canReadRecord(hod, mod, rec())).toBe(true);
    expect(canReadRecord(hod, mod, rec({ departmentId: 'd2' }))).toBe(false);
  });

  it('lets the owning dean read across departments, but not another dean', () => {
    expect(canReadRecord(user({ id: 'x', role: 'drie', departmentId: null }), mod, rec({ departmentId: 'd9' })))
      .toBe(true);
    expect(canReadRecord(user({ id: 'y', role: 'cdc', departmentId: null }), mod, rec())).toBe(false);
  });

  it('lets admin read everything', () => {
    expect(canReadRecord(user({ id: 'z', role: 'admin', departmentId: null }), mod, rec({ ownerUserId: 'other' })))
      .toBe(true);
  });
});

describe('editing rules', () => {
  it('lets the owner edit at any stage, including after approval', () => {
    for (const status of ['draft', 'submitted', 'verified', 'approved', 'returned'] as const) {
      expect(canEditRecord(user({}), mod, rec({ status })), status).toBe(true);
    }
  });

  it('lets the owner delete a record at any stage, asking for a reason once it is approved', () => {
    for (const status of ['draft', 'returned', 'approved'] as const) {
      expect(canDeleteRecord(user({}), mod, rec({ status })), status).toBe(true);
    }
    expect(deleteNeedsReason(user({}), rec({ status: 'draft' }))).toBe(false);
    expect(deleteNeedsReason(user({}), rec({ status: 'approved' }))).toBe(true);
  });

  it('lets IQAC delete anyone’s record, always with a reason, and nobody else', () => {
    const admin = user({ id: 'a', role: 'admin', departmentId: null });
    expect(canDeleteRecord(admin, mod, rec({ status: 'draft' }))).toBe(true);
    expect(deleteNeedsReason(admin, rec({ status: 'draft' }))).toBe(true);
    expect(canDeleteRecord(user({ id: 'h', role: 'hod' }), mod, rec())).toBe(false);
    expect(canDeleteRecord(user({ id: 'd', role: 'drie', departmentId: null }), mod, rec())).toBe(false);
  });

  it('never lets a non-owner faculty edit or delete', () => {
    expect(canEditRecord(user({ id: 'u2' }), mod, rec())).toBe(false);
    expect(canDeleteRecord(user({ id: 'u2' }), mod, rec())).toBe(false);
  });

  it('does not let the verifying dean edit the record they verify', () => {
    expect(canEditRecord(user({ id: 'd', role: 'drie', departmentId: null }), mod, rec())).toBe(false);
  });
});

describe('workflow transitions', () => {
  it('approves on submission in every module, and lets the offices and the HOD return an approved record', () => {
    const owner = user({});
    const drie = user({ id: 'd', role: 'drie', departmentId: null });
    const hod = user({ id: 'h', role: 'hod' });
    const otherHod = user({ id: 'h2', role: 'hod', departmentId: 'dept-2' });
    const admin = user({ id: 'a', role: 'admin', departmentId: null });

    for (const m of MODULE_LIST) {
      expect(canTransition(owner, m, rec(), 'submit').next, m.key).toBe('approved');
    }
    const classic = MODULES.consultancy!;
    expect(canTransition(drie, classic, rec({ status: 'approved' }), 'return').next).toBe('returned');
    expect(canTransition(admin, classic, rec({ status: 'approved' }), 'return').next).toBe('returned');
    expect(canTransition(owner, classic, rec({ status: 'approved' }), 'return').allowed).toBe(false);
    expect(canTransition(hod, mod, rec({ status: 'approved' }), 'return').next).toBe('returned');
    expect(canTransition(otherHod, mod, rec({ status: 'approved' }), 'return').allowed).toBe(false);
  });

  it('lets the offices return an approved record in publications, books and patents', () => {
    const drie = user({ id: 'd', role: 'drie', departmentId: null });
    for (const key of ['publications', 'books', 'patents']) {
      expect(canTransition(drie, MODULES[key]!, rec({ status: 'approved' }), 'return').next, key).toBe('returned');
    }
  });

  it('never lets anyone return their own record, a HOD’s own profile included', () => {
    const hod = user({ id: 'h', role: 'hod' });
    const profile = MODULES.profile!;
    expect(canTransition(hod, profile, rec({ ownerUserId: 'h', status: 'approved' }), 'return').allowed).toBe(false);
    expect(canTransition(hod, profile, rec({ status: 'approved' }), 'return').next).toBe('returned');
  });

  it('lets a HOD own and create a profile', () => {
    expect(canCreateIn(user({ id: 'h', role: 'hod' }), MODULES.profile!)).toBe(true);
  });

  it('does not let another office return a module that is not theirs', () => {
    const cdc = user({ id: 'c', role: 'cdc', departmentId: null });
    expect(canTransition(cdc, mod, rec({ status: 'approved' }), 'return').allowed).toBe(false);
  });
});

describe('department modules', () => {
  it('lets a faculty member read only their own department’s MoUs', () => {
    const mous = MODULES.mous!;
    const record = (departmentId: string) => ({ ownerUserId: 'hod-x', departmentId, status: 'approved' as const });
    expect(canReadRecord(user({}), mous, record('d1'))).toBe(true);
    expect(canReadRecord(user({}), mous, record('d2'))).toBe(false);
  });
});

describe('capabilities', () => {
  it('reserves user management, lists, cycle and PII reveal for admin', () => {
    for (const role of ['faculty', 'hod', 'dofa', 'drie', 'dugs', 'cdc'] as const) {
      expect(hasCapability(user({ role }), 'revealPii'), role).toBe(false);
      expect(hasCapability(user({ role }), 'manageUsers'), role).toBe(false);
      expect(hasCapability(user({ role }), 'manageLists'), role).toBe(false);
      expect(hasCapability(user({ role }), 'manageCycle'), role).toBe(false);
      expect(hasCapability(user({ role }), 'viewAudit'), role).toBe(false);
    }
    expect(hasCapability(user({ role: 'admin' }), 'revealPii')).toBe(true);
    expect(hasCapability(user({ role: 'admin' }), 'viewAudit')).toBe(true);
  });

  it('only owner roles may create', () => {
    expect(canCreateIn(user({ role: 'faculty' }), mod)).toBe(true);
    expect(canCreateIn(user({ role: 'hod' }), mod)).toBe(true);        // a HOD is also a faculty member
    // Every post is held by a professor, who reports their own work too.
    for (const role of ['dofa', 'drie', 'dugs', 'cdc', 'admin'] as const) {
      expect(canCreateIn(user({ role }), mod), role).toBe(true);
    }
    // An office module stays its office's: a dean does not enter CDC's competitive-exam results.
    expect(canCreateIn(user({ role: 'drie' }), MODULES.exams!)).toBe(false);
  });

  it('shows an office holder only their own records in a module they fill in but do not oversee', () => {
    const dugs = user({ id: 'g1', role: 'dugs', departmentId: 'd1' });
    // DUGS neither verifies nor views patents: it reads its own patent and nobody else's.
    expect(canReadRecord(dugs, MODULES.patents!, rec({ ownerUserId: 'g1' }))).toBe(true);
    expect(canReadRecord(dugs, MODULES.patents!, rec({ ownerUserId: 'u9' }))).toBe(false);
  });
});

describe('every module is reachable and verifiable by somebody', () => {
  it('gives each of the 25 modules an owner role and a verifier', () => {
    expect(MODULE_LIST).toHaveLength(25);
    for (const m of MODULE_LIST) {
      expect(m.ownerRoles.length, `${m.key} has no owner role`).toBeGreaterThan(0);
      expect(m.verifierRoles.length, `${m.key} has no verifier role`).toBeGreaterThan(0);
      // The owning role must be able to open its own module.
      for (const role of m.ownerRoles) {
        expect(canViewModule(user({ role }), m), `${m.key} not visible to its owner ${role}`).toBe(true);
      }
      for (const role of m.verifierRoles) {
        expect(canVerify(user({ role }), m), `${m.key} not verifiable by ${role}`).toBe(true);
      }
    }
  });

  it('never lets anyone return their own record, though a verifying office may own records too', () => {
    // DRIE checks patents and, being professors, its staff file patents as well.
    const drie = user({ id: 'r1', role: 'drie', departmentId: 'd1' });
    for (const m of MODULE_LIST.filter((x) => x.verifierRoles.includes('drie'))) {
      const own = canTransition(drie, m, rec({ ownerUserId: 'r1', status: 'approved' }), 'return');
      expect(own.allowed, `${m.key}: own record`).toBe(false);
      const other = canTransition(drie, m, rec({ ownerUserId: 'u9', status: 'approved' }), 'return');
      expect(other.allowed, `${m.key}: someone else's record`).toBe(true);
    }
  });
});
