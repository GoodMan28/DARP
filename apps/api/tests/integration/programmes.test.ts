import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadBitLists } from '../helpers/lists';
import { loadTestInstitutes } from '../helpers/institutes';
import { createRecord, getRecord, updateRecord } from '@/server/records/service';
import { getAllLists } from '@/server/records/masterLists';
import type { SessionUser } from '@/server/auth/session';

/* Phase 5: programme, specialisation and designation are dropdowns with BIT's data. */

let faculty: SessionUser;
let hod: SessionUser;

const student = (over: Record<string, unknown> = {}) => ({
  studentName: 'Asha Kumari', rollNo: `MTECH/${Math.random().toString(36).slice(2, 8)}/24`, program: 'M.Tech.',
  specialisation: 'Aerospace Engineering', yearOfPassing: '2025', statusAfterPassing: 'None of the above', ...over,
});

beforeAll(async () => {
  await truncateAll();
  await loadBitLists();
  await loadTestInstitutes();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  hod = await makeUser({ role: 'hod', dept: 'CSE' });
});
afterAll(async () => { await closeDb(); });

describe('Students Guided', () => {
  it('works the level out from the programme, whatever the browser sent', async () => {
    const rec = await createRecord(faculty, 'studentsguided', student({ level: 'UG' }), 'submit');
    expect((await getRecord(faculty, 'studentsguided', rec.id)).data).toMatchObject({ program: 'M.Tech.', level: 'PG', specialisation: 'Aerospace Engineering' });
    const phd = await createRecord(faculty, 'studentsguided', student({ program: 'Ph.D.', specialisation: 'Chemistry' }), 'submit');
    expect((await getRecord(faculty, 'studentsguided', phd.id)).data.level).toBe('PHD');
  });

  it('refuses a specialisation of another programme', async () => {
    await expect(createRecord(faculty, 'studentsguided', student({ program: 'MBA', specialisation: 'Aerospace Engineering' }), 'submit'))
      .rejects.toMatchObject({ fields: { specialisation: 'Choose one of the listed values.' } });
  });

  it('needs no specialisation for a programme that has none', async () => {
    const rec = await createRecord(faculty, 'studentsguided', student({ program: 'MCA', specialisation: '' }), 'submit');
    expect((await getRecord(faculty, 'studentsguided', rec.id)).data).toMatchObject({ program: 'MCA', level: 'PG' });
  });

  it('keeps a programme typed earlier in a draft, and asks for a choice on submitting', async () => {
    const old = student({ program: 'BTech', specialisation: 'CSE' });
    const draft = await createRecord(faculty, 'studentsguided', old, 'draft');
    expect((await getRecord(faculty, 'studentsguided', draft.id)).data.program).toBe('BTech');
    await expect(updateRecord(faculty, 'studentsguided', draft.id, old, 'submit'))
      .rejects.toMatchObject({ fields: { program: 'Choose one of the listed values.' } });
    await updateRecord(faculty, 'studentsguided', draft.id, student({ rollNo: old.rollNo, program: 'B.Tech.', specialisation: 'Computer Science & Engineering' }), 'submit');
    expect((await getRecord(faculty, 'studentsguided', draft.id)).data).toMatchObject({ program: 'B.Tech.', level: 'UG' });
  });

  it('takes the programme a student moved on to from a list, or a typed one', async () => {
    const base = { statusAfterPassing: 'Higher Studies', institutionEnrolledCode: 'U-0050' };
    const listed = await createRecord(faculty, 'studentsguided', student({ ...base, programEnrolled: 'M.Tech./M.E.' }), 'submit');
    expect((await getRecord(faculty, 'studentsguided', listed.id)).data.programEnrolled).toBe('M.Tech./M.E.');
    const typed = await createRecord(faculty, 'studentsguided', student({ ...base, programEnrolled: 'Master of Fine Arts' }), 'submit');
    expect((await getRecord(faculty, 'studentsguided', typed.id)).data.programEnrolled).toBe('Master of Fine Arts');
  });
});

describe('Student Mentorship', () => {
  it('takes the branch under the chosen programme', async () => {
    const mentee = { studentName: 'Ravi Kumar', program: 'B.Tech.', branch: 'Civil Engineering' };
    const rec = await createRecord(faculty, 'mentorship', { ...mentee, rollNo: 'BTECH/1/24' }, 'submit');
    expect((await getRecord(faculty, 'mentorship', rec.id)).data.branch).toBe('Civil Engineering');
    await expect(createRecord(faculty, 'mentorship', { ...mentee, rollNo: 'BTECH/2/24', branch: 'Marketing' }, 'submit'))
      .rejects.toMatchObject({ fields: { branch: 'Choose one of the listed values.' } });
  });
});

describe('Student Workshops', () => {
  it('builds the programme name from the programme and specialisation', async () => {
    const rec = await createRecord(hod, 'workshops', {
      program: 'B.Tech.', specialisation: 'Computer Science & Engineering', programCode: 'BT-CSE',
      studentsInWorkshops: 'Asha 1\nRavi 2', liveProjects: '3', ethicsEvents: '1', industryGuestSpeakers: '2', studentsInResearchCount: '4',
    }, 'submit');
    expect((await getRecord(hod, 'workshops', rec.id)).data.programmeName).toBe('B.Tech. Computer Science & Engineering');
  });
});

describe('people and places outside BIT', () => {
  const contact = (over: Record<string, unknown> = {}) => ({
    title: 'Dr.', firstName: 'Claire', lastName: 'Dupont', designation: 'Professor', department: 'Physics',
    institutionCode: 'ROR-04paris01', email: `c${Math.random().toString(36).slice(2, 8)}@u-paris.fr`,
    specialisation: 'Natural Sciences', consentStatus: 'Not yet contacted', ...over,
  });

  it('takes a choice from the general lists, or a typed answer under "Other"', async () => {
    const listed = await createRecord(faculty, 'qscontacts', contact(), 'submit');
    expect((await getRecord(faculty, 'qscontacts', listed.id)).data).toMatchObject({ designation: 'Professor', specialisation: 'Natural Sciences' });
    const typed = await createRecord(faculty, 'qscontacts', contact({ designation: 'Emeritus Fellow', department: 'Institute of Optics', specialisation: 'Photonics' }), 'submit');
    expect((await getRecord(faculty, 'qscontacts', typed.id)).data).toMatchObject({ designation: 'Emeritus Fellow', department: 'Institute of Optics', specialisation: 'Photonics' });
  });

  it('is asked a degree programme from the list of degrees', async () => {
    const rec = await createRecord(faculty, 'outreach', {
      activityType: 'PhD thesis review', eventName: 'Thesis of A. Roy', examinerRole: 'External examiner', degreeProgramme: 'Ph.D.',
      organisation: 'IIT Delhi', where: 'Outside BIT', year: '2025',
    }, 'submit');
    expect((await getRecord(faculty, 'outreach', rec.id)).data.degreeProgramme).toBe('Ph.D.');
  });
});

describe('the designation list', () => {
  it('has BIT’s grades, so a profile can say Professor of Practice', async () => {
    expect((await getAllLists()).designations).toEqual(
      expect.arrayContaining(['Assistant Professor of Practice', 'Professor of Practice', 'Adjunct Professor', 'Visiting Professor']),
    );
  });
});
