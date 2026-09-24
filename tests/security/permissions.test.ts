import { describe, it, expect } from 'vitest';
import {
  canReadRecord, canEditRecord, canDeleteRecord, canTransition, canCreateIn,
  canVerify, canViewModule, hasCapability,
} from '@/server/auth/permissions';
import type { SessionUser } from '@/server/auth/session';
import { MODULES, MODULE_LIST } from '@/modules';

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
  it('blocks editing once submitted, and frees it again on return', () => {
    expect(canEditRecord(user({}), mod, rec({ status: 'submitted' }))).toBe(false);
    expect(canEditRecord(user({}), mod, rec({ status: 'verified' }))).toBe(false);
    expect(canEditRecord(user({}), mod, rec({ status: 'approved' }))).toBe(false);
    expect(canEditRecord(user({}), mod, rec({ status: 'returned' }))).toBe(true);
    expect(canEditRecord(user({}), mod, rec({ status: 'draft' }))).toBe(true);
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
  it('follows the locked lifecycle', () => {
    const owner = user({});
    const drie = user({ id: 'd', role: 'drie', departmentId: null });
    const admin = user({ id: 'a', role: 'admin', departmentId: null });

    expect(canTransition(owner, mod, rec(), 'submit').next).toBe('submitted');
    expect(canTransition(owner, mod, rec(), 'verify').allowed).toBe(false);
    expect(canTransition(drie, mod, rec({ status: 'submitted' }), 'verify').next).toBe('verified');
    expect(canTransition(drie, mod, rec({ status: 'verified' }), 'approve').allowed).toBe(false);
    expect(canTransition(admin, mod, rec({ status: 'verified' }), 'approve').next).toBe('approved');
    expect(canTransition(admin, mod, rec({ status: 'approved' }), 'unlock').next).toBe('verified');
    expect(canTransition(drie, mod, rec({ status: 'approved' }), 'unlock').allowed).toBe(false);
  });

  it('refuses to verify a record that was never submitted', () => {
    const drie = user({ id: 'd', role: 'drie', departmentId: null });
    expect(canTransition(drie, mod, rec({ status: 'draft' }), 'verify').allowed).toBe(false);
    expect(canTransition(drie, mod, rec({ status: 'approved' }), 'verify').allowed).toBe(false);
  });

  it('does not let another office verify a module that is not theirs', () => {
    const cdc = user({ id: 'c', role: 'cdc', departmentId: null });
    expect(canTransition(cdc, mod, rec({ status: 'submitted' }), 'verify').allowed).toBe(false);
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
    expect(canCreateIn(user({ role: 'hod' }), mod)).toBe(false);
    expect(canCreateIn(user({ role: 'admin' }), mod)).toBe(true);
  });
});

describe('every module is reachable and verifiable by somebody', () => {
  it('gives each of the 24 modules an owner role and a verifier', () => {
    expect(MODULE_LIST).toHaveLength(24);
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

  it('never lets a module be verified by the same role that owns it', () => {
    for (const m of MODULE_LIST) {
      const selfVerified = m.ownerRoles.filter((r) => m.verifierRoles.includes(r) && r !== 'admin');
      expect(selfVerified, `${m.key} is verified by its own owner`).toEqual([]);
    }
  });
});
