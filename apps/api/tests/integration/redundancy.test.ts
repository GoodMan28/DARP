import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadBitLists } from '../helpers/lists';
import { loadTestInstitutes } from '../helpers/institutes';
import { createRecord, getRecord } from '@/server/records/service';
import { earlierStudent } from '@/server/records/students';
import { generateWorkbookFromRows } from '@/server/export/excel';
import { MODULES } from '@darp/shared/modules';
import type { SessionUser } from '@/server/auth/session';

/* Phase 6: things people typed twice, or that the system already knows. */

let faculty: SessionUser;
let colleague: SessionUser;
let hod: SessionUser;

beforeAll(async () => {
  await truncateAll();
  await loadBitLists();
  await loadTestInstitutes();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  colleague = await makeUser({ role: 'faculty', dept: 'CSE' });
  hod = await makeUser({ role: 'hod', dept: 'CSE' });
});
afterAll(async () => { await closeDb(); });

describe('MoUs', () => {
  const mou = (over: Record<string, unknown> = {}) => ({
    organisation: 'x', organisationCode: 'ROR-05acme001', signingDate: '2024-02-01', durationYears: '3',
    activities: 'Two workshops', participants: '40', ...over,
  });

  it('asks for the organisation once, and fills the second column from it', async () => {
    const rec = await createRecord(hod, 'mous', mou({ institutionName: 'Something else', institutionNameCode: 'U-0050' }), 'submit');
    expect((await getRecord(hod, 'mous', rec.id)).data).toMatchObject({
      organisation: 'Acme Robotics, Inc., Texas, United States', institutionName: 'Acme Robotics, Inc., Texas, United States',
      organisationCode: 'ROR-05acme001', institutionNameCode: 'ROR-05acme001',
    });
  });

  it('is not refused for the hidden copy when the organisation was typed before the directory, in a draft', async () => {
    const rec = await createRecord(hod, 'mous', mou({ organisation: 'Old Corp', organisationCode: '', signingDate: '2023-02-01' }), 'draft');
    expect((await getRecord(hod, 'mous', rec.id)).data).toMatchObject({ organisation: 'Old Corp', institutionName: 'Old Corp' });
  });

  it('still fills both of IQAC’s columns in Excel', async () => {
    const rec = await createRecord(hod, 'mous', mou({ signingDate: '2022-02-01' }), 'submit');
    const read = await getRecord(hod, 'mous', rec.id);
    const { workbook } = await generateWorkbookFromRows('hod', { includePii: false }, {
      mous: [{ data: read.editValues ?? {}, ownerName: 'Dr X', department: 'CSE', profile: {} }],
    });
    const sheet = workbook.getWorksheet('MoUs')!;
    const cells: string[] = [];
    sheet.eachRow((row) => row.eachCell((c) => cells.push(c.text)));
    expect(cells.filter((c) => c.startsWith('Acme Robotics')).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Student Workshops: the count follows the list', () => {
  const programme = (over: Record<string, unknown> = {}) => ({
    program: 'M.Tech.', specialisation: 'Aerospace Engineering', programCode: `AE-${Math.random().toString(36).slice(2, 6)}`,
    studentsInWorkshops: 'Asha 1', liveProjects: '1', ethicsEvents: '1', industryGuestSpeakers: '1', studentsInResearchCount: '99', ...over,
  });

  it('counts one student a line, ignoring blank lines, whatever number was typed', async () => {
    const rec = await createRecord(hod, 'workshops', programme({ studentsInResearch: 'Asha 1\n\nRavi 2\n  \nMina 3' }), 'submit');
    expect((await getRecord(hod, 'workshops', rec.id)).data.studentsInResearchCount).toBe(3);
  });

  it('keeps a typed number when there is no list', async () => {
    const rec = await createRecord(hod, 'workshops', programme({ studentsInResearchCount: '7' }), 'submit');
    expect((await getRecord(hod, 'workshops', rec.id)).data.studentsInResearchCount).toBe(7);
  });
});

describe('Outreach: the year follows the date', () => {
  const activity = (over: Record<string, unknown> = {}) => ({
    activityType: 'Invited talk', eventName: 'Seminar', talkTitle: 'Talk', organisation: 'IIT Delhi', organisationCode: 'U-0050', year: '2023', affiliatedToBit: 'Yes', ...over,
  });

  it('takes the year from the date, over a different one typed', async () => {
    const rec = await createRecord(faculty, 'outreach', activity({ date: '2024-06-01' }), 'submit');
    expect((await getRecord(faculty, 'outreach', rec.id)).data).toMatchObject({ year: 2024, date: '2024-06-01' });
  });

  it('keeps the year typed when there is no date', async () => {
    const rec = await createRecord(faculty, 'outreach', activity(), 'submit');
    expect((await getRecord(faculty, 'outreach', rec.id)).data.year).toBe(2023);
  });
});

describe('a student entered before', () => {
  beforeAll(async () => {
    await createRecord(faculty, 'mentorship', {
      studentName: 'Ravi Kumar', rollNo: 'BTECH/1234/22', program: 'B.Tech.', branch: 'Civil Engineering', email: 'ravi@example.com', phone: '9876543210',
    }, 'submit');
  });

  it('is found by roll number, in any case, from the person’s own entries', async () => {
    expect(await earlierStudent(faculty, 'btech/1234/22')).toMatchObject({
      studentName: 'Ravi Kumar', program: 'B.Tech.', specialisation: 'Civil Engineering', email: 'ravi@example.com', phone: '9876543210',
    });
  });

  it('is never offered to a colleague', async () => {
    expect(await earlierStudent(colleague, 'BTECH/1234/22')).toBeNull();
    expect(await earlierStudent(hod, 'BTECH/1234/22')).toBeNull();
  });

  it('finds nothing for an unknown or a very short roll number', async () => {
    expect(await earlierStudent(faculty, 'NOPE/0/00')).toBeNull();
    expect(await earlierStudent(faculty, 'B')).toBeNull();
  });
});

describe('suggestions on a new record', () => {
  it('are set on the three fields that usually repeat something already known', () => {
    const where = Object.values(MODULES).flatMap((m) => m.fields.filter((f) => f.prefill).map((f) => `${m.key}.${f.key}`)).sort();
    expect(where).toEqual(['consultancy.consultants', 'patents.assignee', 'riawards.awardeeName']);
    expect(MODULES.patents!.fields.find((f) => f.key === 'assignee')!.prefill).toEqual({ from: 'applicant' });
  });
});
