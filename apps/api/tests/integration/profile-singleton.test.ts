import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadTestInstitutes } from '../helpers/institutes';
import { fullProfile } from '../helpers/profile';
import { users } from '@/server/db/schema';
import { createRecord, updateRecord, getRecord, deleteRecord, transitionRecord, listRecords } from '@/server/records/service';
import { syncProfileFromAccount } from '@/server/records/profileSync';
import { generateWorkbookFromRows } from '@/server/export/excel';
import type { SessionUser } from '@/server/auth/session';

/* Phase 3: the Faculty Profile is one record per person with no approval, and the account's name and joining date. */

let faculty: SessionUser;
let admin: SessionUser;

beforeAll(async () => {
  await truncateAll();
  await loadTestInstitutes();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  admin = await makeUser({ role: 'admin' });
  await db.update(users).set({ dateOfJoining: '2011-07-18' }).where(eq(users.id, faculty.id));
});
afterAll(async () => { await closeDb(); });

describe('the Faculty Profile has no approval', () => {
  it('is approved by saving it: a draft request makes no draft', async () => {
    const rec = await createRecord(faculty, 'profile', fullProfile(), 'draft');
    expect(rec.status).toBe('approved');
  });

  it('uses the account’s name and joining date, whatever the browser sent', async () => {
    const [mine] = (await listRecords(faculty, 'profile', { mine: true })).rows;
    const read = await getRecord(faculty, 'profile', mine!.id);
    expect(read.data.name).toBe(faculty.name);
    expect(read.data.joiningDate).toBe('2011-07-18');
    await updateRecord(faculty, 'profile', mine!.id, fullProfile({ name: 'Somebody Else', joiningDate: '1999-01-01' }), 'submit');
    expect((await getRecord(faculty, 'profile', mine!.id)).data).toMatchObject({ name: faculty.name, joiningDate: '2011-07-18' });
  });

  it('cannot be deleted, not even by IQAC, and cannot be returned', async () => {
    const [mine] = (await listRecords(faculty, 'profile', { mine: true })).rows;
    await expect(deleteRecord(faculty, 'profile', mine!.id)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(deleteRecord(admin, 'profile', mine!.id, 'tidy up please')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(transitionRecord(admin, 'profile', mine!.id, 'return', 'please redo')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('keeps PAN and Aadhaar when other answers change and they are left blank', async () => {
    const [mine] = (await listRecords(faculty, 'profile', { mine: true })).rows;
    await updateRecord(faculty, 'profile', mine!.id, fullProfile({ pan: '', aadhaar: '', researchHours: '250' }), 'submit');
    const read = await getRecord(faculty, 'profile', mine!.id);
    expect(String(read.data.aadhaar)).toMatch(/2346$/);
    expect(read.data.researchHours).toBe(250);
  });

  it('still asks for PAN and Aadhaar the first time', async () => {
    const newcomer = await makeUser({ role: 'faculty', dept: 'CSE' });
    await expect(createRecord(newcomer, 'profile', fullProfile({ pan: '', aadhaar: '' }), 'submit'))
      .rejects.toMatchObject({ fields: { pan: expect.any(String), aadhaar: expect.any(String) } });
  });
});

describe('the profile follows the account', () => {
  it('takes IQAC’s change of name and joining date into the record', async () => {
    const [mine] = (await listRecords(faculty, 'profile', { mine: true })).rows;
    await syncProfileFromAccount(faculty.id, 'Prof. (Dr.) Anil Verma', '2012-01-02');
    expect((await getRecord(faculty, 'profile', mine!.id)).data).toMatchObject({ name: 'Prof. (Dr.) Anil Verma', joiningDate: '2012-01-02' });
    await syncProfileFromAccount(faculty.id, faculty.name, '2011-07-18');
  });

  it('writes the account’s name and joining date on the Profile sheet', async () => {
    const [mine] = (await listRecords(faculty, 'profile', { mine: true })).rows;
    const read = await getRecord(faculty, 'profile', mine!.id);
    const { workbook } = await generateWorkbookFromRows('faculty', { includePii: false }, {
      profile: [{ data: read.editValues ?? {}, ownerName: faculty.name, department: 'CSE', profile: {} }],
    });
    const cells: string[] = [];
    workbook.getWorksheet('Profile')!.eachRow((row) => row.eachCell((c) => cells.push(c.text)));
    expect(cells.some((c) => c.includes(faculty.name))).toBe(true);
  });
});

describe('the PG institute', () => {
  it('is not asked when there is no PG degree, and is asked when there is', async () => {
    const person = await makeUser({ role: 'faculty', dept: 'CSE' });
    await createRecord(person, 'profile', fullProfile({ pgQualification: 'None', pgInstitutionCode: 'U-0050' }), 'submit');
    const [mine] = (await listRecords(person, 'profile', { mine: true })).rows;
    expect((await getRecord(person, 'profile', mine!.id)).data.pgInstitutionCode).toBeUndefined();
    await updateRecord(person, 'profile', mine!.id, fullProfile({ pgQualification: 'M.E./M.Tech', pgInstitutionCode: 'U-0050' }), 'submit');
    expect((await getRecord(person, 'profile', mine!.id)).data.pgInstitutionCode).toBe('U-0050');
  });
});
