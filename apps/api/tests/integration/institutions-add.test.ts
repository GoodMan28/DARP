import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadBitLists } from '../helpers/lists';
import { loadTestInstitutes } from '../helpers/institutes';
import { institutions, records } from '@/server/db/schema';
import { createRecord, getRecord } from '@/server/records/service';
import { proposeInstitute, DAILY_LIMIT } from '@/server/institutions/propose';
import { searchInstitutes, institutesByCode } from '@/server/institutions/service';
import { listPending, approveInstitute } from '@/server/institutions/review';
import { mergeInstitute, institutionUsage } from '@/server/records/institutionMerge';
import type { SessionUser } from '@/server/auth/session';

/* Phase 4 of the decisions plan: an organisation the directory lacks can be added, then reviewed by IQAC. */

let faculty: SessionUser;
let colleague: SessionUser;
let hod: SessionUser;
let iqac: SessionUser;

const company = (over: Record<string, unknown> = {}) => ({ name: 'Eastern Alloys Pvt Ltd', kind: 'Company', country: 'India', city: 'Jamshedpur', state: 'Jharkhand', ...over });
const contact = (code: string, over: Record<string, unknown> = {}) => ({
  title: 'Dr.', firstName: 'Ravi', lastName: 'Menon', designation: 'Professor', department: 'Physics', institution: 'x', institutionCode: code,
  email: `ravi${Math.random().toString(36).slice(2, 8)}@example.com`, specialisation: 'Optics', consentStatus: 'Not yet contacted', ...over,
});

beforeAll(async () => {
  await truncateAll();
  await loadBitLists();
  await loadTestInstitutes();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  colleague = await makeUser({ role: 'faculty', dept: 'CSE' });
  hod = await makeUser({ role: 'hod', dept: 'CSE' });
  iqac = await makeUser({ role: 'admin' });
});
afterAll(async () => { await closeDb(); });

describe('adding an organisation the directory lacks', () => {
  it('is usable at once, waits for IQAC, and is found by search', async () => {
    const hit = await proposeInstitute(faculty, company());
    expect(hit).toMatchObject({ name: 'Eastern Alloys Pvt Ltd', country: 'India', state: 'Jharkhand', scheme: 'local', pending: true });
    expect(hit.code).toMatch(/^DARP-\d{6}$/);
    expect((await searchInstitutes('eastern alloys')).map((h) => h.code)).toContain(hit.code);
  });

  it('can be chosen on a QS contact, an FDP-style institute box, and a MoU, and its name reaches the record', async () => {
    const hit = await proposeInstitute(faculty, company({ name: 'Southern Optics Ltd' }));
    const rec = await createRecord(faculty, 'qscontacts', contact(hit.code), 'submit');
    expect((await getRecord(faculty, 'qscontacts', rec.id)).data).toMatchObject({ institutionCode: hit.code, institution: 'Southern Optics Ltd, Jharkhand, India', country: 'India' });
    const mou = await createRecord(hod, 'mous', { organisation: 'x', organisationCode: hit.code, signingDate: '2024-05-05', durationYears: '2', activities: 'A', participants: '10' }, 'submit');
    expect((await getRecord(hod, 'mous', mou.id)).data).toMatchObject({ organisationCode: hit.code, institutionNameCode: hit.code });
  });

  it('returns the entry that is already there for the same name and country, instead of a second', async () => {
    const a = await proposeInstitute(faculty, company({ name: 'Northern Gears Ltd' }));
    const b = await proposeInstitute(colleague, company({ name: ' northern  GEARS ltd. ' }));
    expect(b.code).toBe(a.code);
    expect((await proposeInstitute(colleague, company({ name: 'Indian Institute of Technology Kharagpur', kind: 'College or university' }))).code).toBe('U-0050');
    // another country is another organisation
    expect((await proposeInstitute(colleague, company({ name: 'Northern Gears Ltd', country: 'Germany', state: 'Bavaria' }))).code).not.toBe(a.code);
  });

  it('keeps a state only for India, and refuses an unknown kind, a missing country, and a name that is too short', async () => {
    const hit = await proposeInstitute(faculty, company({ name: 'Rhein Metals GmbH', country: 'Germany', state: 'Bavaria' }));
    expect(hit.state).toBeNull();
    await expect(proposeInstitute(faculty, company({ kind: 'Club' }))).rejects.toMatchObject({ fields: { kind: expect.any(String) } });
    await expect(proposeInstitute(faculty, company({ country: 'Atlantis' }))).rejects.toMatchObject({ fields: { country: expect.any(String) } });
    await expect(proposeInstitute(faculty, company({ country: 'WIPO (PCT)' }))).rejects.toMatchObject({ fields: { country: expect.any(String) } });
    await expect(proposeInstitute(faculty, company({ name: 'ab' }))).rejects.toMatchObject({ fields: { name: expect.any(String) } });
  });

  it('is approved already when IQAC adds it', async () => {
    expect(await proposeInstitute(iqac, company({ name: 'Added By IQAC Ltd' }))).toMatchObject({ pending: false });
  });

  it('is limited each day for a person, not for IQAC', async () => {
    const busy = await makeUser({ role: 'faculty', dept: 'CSE' });
    for (let i = 0; i < DAILY_LIMIT; i += 1) await proposeInstitute(busy, company({ name: `Daily Limit Works ${i} Ltd` }));
    await expect(proposeInstitute(busy, company({ name: 'One Too Many Ltd' }))).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await proposeInstitute(iqac, company({ name: 'One Too Many Ltd' }))).pending).toBe(false);
  });
});

describe('IQAC reviewing what was added', () => {
  it('lists what is waiting with how many records use each, for IQAC only', async () => {
    const hit = await proposeInstitute(faculty, company({ name: 'Counted Works Ltd' }));
    await createRecord(faculty, 'qscontacts', contact(hit.code), 'submit');
    await createRecord(hod, 'mous', { organisation: 'x', organisationCode: hit.code, signingDate: '2024-06-06', durationYears: '2', activities: 'A', participants: '10' }, 'submit');
    const row = (await listPending(iqac)).find((p) => p.code === hit.code)!;
    expect(row).toMatchObject({ records: 2, kind: 'company', addedBy: faculty.name });     // a contact and a MoU (its hidden copy is not counted twice)
    await expect(listPending(faculty)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(institutionUsage(hod, [hit.code])).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('approves one as it is, and refuses anyone else', async () => {
    const hit = await proposeInstitute(faculty, company({ name: 'Approve Me Ltd' }));
    await expect(approveInstitute(faculty, hit.code)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await approveInstitute(iqac, hit.code)).toMatchObject({ code: hit.code, pending: false });
    expect((await listPending(iqac)).map((p) => p.code)).not.toContain(hit.code);
  });
});

describe('merging an added organisation into the one it duplicates', () => {
  it('rewrites the records in every module, and the old code still finds the new institute', async () => {
    const dup = await proposeInstitute(faculty, company({ name: 'BIT Mesra Ranchi Alumni Ltd' }));
    const qs = await createRecord(faculty, 'qscontacts', contact(dup.code), 'submit');
    const other = await createRecord(colleague, 'qscontacts', contact('U-0050'), 'submit');
    const mou = await createRecord(hod, 'mous', { organisation: 'x', organisationCode: dup.code, signingDate: '2024-07-07', durationYears: '2', activities: 'A', participants: '10' }, 'submit');

    const done = await mergeInstitute(iqac, dup.code, 'U-0050');
    expect(done).toEqual({ records: 2, keyClashes: 0 });

    const want = 'Indian Institute of Technology Kharagpur, West Bengal, India';
    expect((await getRecord(faculty, 'qscontacts', qs.id)).data).toMatchObject({ institutionCode: 'U-0050' });
    expect((await getRecord(hod, 'mous', mou.id)).data).toMatchObject({ organisationCode: 'U-0050', institutionNameCode: 'U-0050' });
    expect((await getRecord(faculty, 'qscontacts', qs.id)).data.institution).toContain('Kharagpur');
    expect(want).toContain('Kharagpur');
    expect((await getRecord(colleague, 'qscontacts', other.id)).data.institutionCode).toBe('U-0050');   // untouched
    expect((await institutesByCode([dup.code])).get(dup.code)?.code).toBe('U-0050');
    expect((await searchInstitutes('BIT Mesra Ranchi Alumni')).map((h) => h.code)).not.toContain(dup.code);
    const [row] = await db.select().from(institutions).where(eq(institutions.code, dup.code));
    expect(row).toMatchObject({ status: 'merged', mergedInto: 'U-0050' });
  });

  it('keeps the old duplicate-guard key, and says so, when the new one would collide', async () => {
    const dup = await proposeInstitute(faculty, company({ name: 'Collide Works Ltd' }));
    const a = await createRecord(hod, 'mous', { organisation: 'x', organisationCode: dup.code, signingDate: '2024-08-08', durationYears: '2', activities: 'A', participants: '10' }, 'submit');
    await createRecord(hod, 'mous', { organisation: 'x', organisationCode: 'ROR-05acme001', signingDate: '2024-08-08', durationYears: '2', activities: 'A', participants: '10' }, 'submit');
    const done = await mergeInstitute(iqac, dup.code, 'ROR-05acme001');
    expect(done).toEqual({ records: 1, keyClashes: 1 });
    const [r] = await db.select({ key: records.naturalKey, data: records.data }).from(records).where(eq(records.id, a.id));
    expect(r!.key).toContain(dup.code.toLowerCase());
    expect((r!.data as Record<string, unknown>).organisationCode).toBe('ROR-05acme001');
  });

  it('is for IQAC only, into an approved institute, never BIT itself, never onto itself', async () => {
    const dup = await proposeInstitute(faculty, company({ name: 'Rules Check Ltd' }));
    const pending = await proposeInstitute(faculty, company({ name: 'Also Pending Ltd' }));
    await expect(mergeInstitute(faculty, dup.code, 'U-0050')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(mergeInstitute(iqac, dup.code, pending.code)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(mergeInstitute(iqac, dup.code, dup.code)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(mergeInstitute(iqac, 'U-0202', 'U-0050')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(mergeInstitute(iqac, 'DARP-999999', 'U-0050')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
