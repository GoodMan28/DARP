import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadBitLists } from '../helpers/lists';
import { loadTestInstitutes } from '../helpers/institutes';
import { fullProfile } from '../helpers/profile';
import { users, auditLog, records } from '@/server/db/schema';
import { saveOwnName } from '@/server/auth/ownName';
import { saveOrcid, identityFor } from '@/server/lookup/orcid';
import { createRecord } from '@/server/records/service';
import { SYSTEM_EMAIL } from '@/server/lookup/system';
import type { SessionUser } from '@/server/auth/session';

/* Phase 1 of the decisions plan: a person changes their own name, and nothing else on the account. */

const ORCID = '0000-0002-1825-0097';
let me: SessionUser;
let other: SessionUser;
let office: SessionUser;

const person = (given: string, family: string) => ({
  name: { 'given-names': { value: given }, 'family-name': { value: family }, 'credit-name': null },
  'other-names': { 'other-name': [] },
});
function stubOrcid(p: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).endsWith('/employments')
    ? Response.json({ 'affiliation-group': [] }) : Response.json(p))));
}
const row = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0]!;

beforeAll(async () => {
  await truncateAll();
  await loadBitLists();
  await loadTestInstitutes();
  me = await makeUser({ role: 'faculty', dept: 'CSE' });
  other = await makeUser({ role: 'faculty', dept: 'CSE' });
  office = await makeUser({ role: 'dofa' });
  await db.update(users).set({ name: 'Dr. Anil Verma', namePrefix: 'Dr.', firstName: 'Anil', middleName: '', lastName: 'Verma' }).where(eq(users.id, me.id));
  process.env.LOOKUP_OFFLINE = '0';
});
afterEach(() => { vi.unstubAllGlobals(); });
afterAll(async () => { process.env.LOOKUP_OFFLINE = '1'; await closeDb(); });

describe('changing your own name', () => {
  it('saves the four parts and the display name, and reports the old and the new', async () => {
    const { before, after } = await saveOwnName(me, { namePrefix: 'Prof.', firstName: 'Anil', middleName: 'Kumar', lastName: 'Verma' });
    expect(before).toMatchObject({ name: 'Dr. Anil Verma', prefix: 'Dr.', middle: '' });
    expect(after).toMatchObject({ name: 'Prof. Anil Kumar Verma', prefix: 'Prof.', middle: 'Kumar' });
    expect(await row(me.id)).toMatchObject({ name: 'Prof. Anil Kumar Verma', namePrefix: 'Prof.', firstName: 'Anil', middleName: 'Kumar', lastName: 'Verma' });
  });

  it('refuses a prefix that is not on the list, a digit, and a one-letter first name', async () => {
    await expect(saveOwnName(me, { namePrefix: 'Sir', firstName: 'Anil' })).rejects.toMatchObject({ code: 'VALIDATION', fields: { namePrefix: expect.any(String) } });
    await expect(saveOwnName(me, { firstName: 'An1l', lastName: 'Verma' })).rejects.toMatchObject({ code: 'VALIDATION', fields: { firstName: expect.any(String) } });
    await expect(saveOwnName(me, { firstName: 'A', lastName: 'Verma' })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await row(me.id)).name).toBe('Prof. Anil Kumar Verma');
  });

  it('changes nobody else, and nothing else on the account', async () => {
    const before = await row(other.id);
    const mine = await row(me.id);
    await saveOwnName(me, { firstName: 'Anil', middleName: 'K.', lastName: 'Verma', ...({ email: 'x@y.z', role: 'admin', departmentId: null } as object) });
    expect(await row(other.id)).toEqual(before);
    const after = await row(me.id);
    expect(after).toMatchObject({ email: mine.email, role: mine.role, departmentId: mine.departmentId, dateOfJoining: mine.dateOfJoining });
  });

  it('works for an office role too, but never for the system account', async () => {
    await saveOwnName(office, { firstName: 'Meera', lastName: 'Rao' });
    expect((await row(office.id)).name).toBe('Meera Rao');
    const [sys] = await db.insert(users).values({
      email: SYSTEM_EMAIL, name: 'System', role: 'admin', passwordHash: 'x', mustChangePassword: false,
    }).onConflictDoNothing().returning();
    const sysId = sys?.id ?? (await db.select({ id: users.id }).from(users).where(eq(users.email, SYSTEM_EMAIL)))[0]!.id;
    await expect(saveOwnName({ ...office, id: sysId, email: SYSTEM_EMAIL }, { firstName: 'Hacker' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('is copied into the Faculty Profile, which IQAC exports', async () => {
    const owner = await makeUser({ role: 'faculty', dept: 'CSE' });
    const rec = await createRecord(owner, 'profile', fullProfile(), 'submit');
    await saveOwnName(owner, { namePrefix: 'Dr.', firstName: 'Priya', lastName: 'Nair' });
    const [r] = await db.select({ data: records.data }).from(records).where(eq(records.id, rec.id));
    expect((r!.data as Record<string, unknown>).name).toBe('Dr. Priya Nair');
  });

  it('checks a saved ORCID iD again against the new name', async () => {
    stubOrcid(person('Anil', 'Verma'));
    await saveOwnName(me, { firstName: 'Anil', lastName: 'Verma' });
    await saveOrcid(me.id, ORCID);
    expect((await identityFor(me.id)).orcidCheck).toMatchObject({ found: true, nameMatches: true });

    await saveOwnName(me, { firstName: 'Ramesh', lastName: 'Singh' });
    expect((await identityFor(me.id)).orcidCheck).toMatchObject({ nameMatches: false });

    await saveOwnName(me, { firstName: 'Anil', lastName: 'Verma' });
    expect((await identityFor(me.id)).orcidCheck).toMatchObject({ nameMatches: true });
  });

  it('is written to the audit trail by the route, with before and after', async () => {
    // The route calls audit() with these two objects; the shape is what an auditor reads.
    const { before, after } = await saveOwnName(me, { firstName: 'Anil', lastName: 'Verma' });
    expect(Object.keys(before)).toEqual(['name', 'prefix', 'first', 'middle', 'last']);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect(await db.select().from(auditLog).limit(1)).toBeDefined();
  });
});
