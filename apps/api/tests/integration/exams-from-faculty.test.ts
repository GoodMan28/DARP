import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadBitLists } from '../helpers/lists';
import { loadTestInstitutes } from '../helpers/institutes';
import { createRecord, updateRecord, getRecord } from '@/server/records/service';
import { facultyExamEntries, facultyExamsNotInList } from '@/server/records/examsFromFaculty';
import { readReportRequest, summariseReport, generateReport } from '@/server/export/reports';
import { examKeys, withoutRepeats } from '@darp/shared/exams';
import type { SessionUser } from '@/server/auth/session';

/* Phase 9 of the decisions plan: CDC's exam list holds the students the faculty entered too, once each. */

let cdc: SessionUser;
let admin: SessionUser;
let guide: SessionUser;
let guide2: SessionUser;
let hod: SessionUser;
const q = (params: Record<string, string>) => new URLSearchParams(params);
const rows = async (actor: SessionUser, params = { from: '2023', to: '2023' }) => {
  const s = await summariseReport(actor, readReportRequest(actor, 'full', q(params)));
  return s.sheets.find((x) => x.moduleKey === 'exams')?.rows ?? 0;
};

const taken = (over: Record<string, unknown>) => ({
  studentName: 'Ravi Kumar', rollNo: 'BTECH/1/19', program: 'B.Tech.', specialisation: 'Civil Engineering', yearOfPassing: '2023',
  statusAfterPassing: 'Competitive exams', examGiven: 'GATE', examRegistrationNo: 'GATE-0001', affiliatedToBit: 'Yes',
  email: 'ravi.private@example.com', phone: '9876500000', ...over,
});
const cdcEntry = (over: Record<string, unknown>) => ({ year: '2023', examName: 'GATE', studentName: 'Ravi Kumar', registrationNo: 'GATE-0001', ...over });

beforeAll(async () => {
  await truncateAll();
  await loadBitLists();
  await loadTestInstitutes();
  cdc = await makeUser({ role: 'cdc' });
  admin = await makeUser({ role: 'admin' });
  guide = await makeUser({ role: 'faculty', dept: 'CSE' });
  guide2 = await makeUser({ role: 'faculty', dept: 'CSE' });
  hod = await makeUser({ role: 'hod', dept: 'CSE' });
});
afterAll(async () => { await closeDb(); });

describe('matching one student', () => {
  it('is by the exam’s own number, or the college roll number, with the same exam in the same year', () => {
    const a = { regNo: 'GATE-0001', exam: 'GATE', year: 2023 };
    expect(examKeys(a)).toEqual(['GATE0001|GATE|2023']);
    expect(examKeys({ ...a, regNo: 'gate 0001' })).toEqual(examKeys(a));                        // case and punctuation
    expect(examKeys({ rollNo: 'btech/1/19', exam: 'GATE', year: 2023 })).toEqual(['BTECH119|GATE|2023']);
    expect(examKeys({ regNo: '', rollNo: '', exam: 'GATE', year: 2023 })).toEqual([]);           // no number, no match
  });

  it('keeps entries that share nothing, and drops a later one that shares any key', () => {
    const entries = [
      { k: ['A|GATE|2023'] }, { k: ['B|GATE|2023', 'A|GATE|2023'] }, { k: ['C|CAT|2023'] }, { k: [] }, { k: [] },
    ];
    const { kept, dropped } = withoutRepeats(entries, (e) => e.k);
    expect(kept).toHaveLength(4);
    expect(dropped).toEqual([entries[1]]);
  });
});

describe('what the faculty entered', () => {
  beforeAll(async () => {
    await createRecord(guide, 'studentsguided', taken({}), 'submit');
  });

  it('reaches the list and the report, when CDC has no entry for the student', async () => {
    expect(await rows(cdc)).toBe(1);
    const { rows: more, repeats } = await facultyExamsNotInList(cdc);
    expect(more).toMatchObject([{ studentName: 'Ravi Kumar', examName: 'GATE', year: 2023, registrationNo: 'GATE-0001', guide: guide.name }]);
    expect(repeats).toBe(0);
  });

  it('is one row, CDC’s, when both entered the same exam number (case and punctuation aside)', async () => {
    await createRecord(cdc, 'exams', cdcEntry({ registrationNo: 'gate 0001' }), 'submit');
    expect(await rows(cdc)).toBe(1);
    expect((await facultyExamsNotInList(cdc)).rows).toHaveLength(0);
  });

  it('is one row too when CDC gave the college roll number instead, with another exam number', async () => {
    await createRecord(guide, 'studentsguided', taken({ studentName: 'Asha Rao', rollNo: 'MTECH/7/20', examGiven: 'CAT', examRegistrationNo: 'CAT-7' }), 'submit');
    await createRecord(cdc, 'exams', cdcEntry({ studentName: 'Asha Rao', examName: 'CAT', registrationNo: 'CAT-OTHER', rollNo: 'mtech/7/20' }), 'submit');
    expect(await rows(cdc)).toBe(2);
  });

  it('is two rows for one student with two exams, or one exam in two years', async () => {
    // A guide records a student once a year; the same student's second exam comes from CDC's own list.
    await createRecord(cdc, 'exams', cdcEntry({ examName: 'CAT', registrationNo: 'CAT-1', rollNo: 'BTECH/1/19' }), 'submit');
    expect(await rows(cdc)).toBe(3);
    await createRecord(guide, 'studentsguided', taken({ rollNo: 'BTECH/1/19', examGiven: 'GATE', examRegistrationNo: 'GATE-0001', yearOfPassing: '2024' }), 'submit');
    expect(await rows(cdc, { from: '2023', to: '2024' })).toBe(4);
  });

  it('is one row when two guides entered the same student', async () => {
    await createRecord(guide, 'studentsguided', taken({ studentName: 'Meera N', rollNo: 'PHD/9/18', examGiven: 'JAM', examRegistrationNo: 'JAM-9' }), 'submit');
    const before = await rows(cdc);
    await createRecord(guide2, 'studentsguided', taken({ studentName: 'Meera N', rollNo: 'PHD/9/18', examGiven: 'JAM', examRegistrationNo: 'JAM-9' }), 'submit').catch(() => null);
    expect(await rows(cdc)).toBe(before);                      // whether or not the second was refused as a copy, the report has one
  });

  it('leaves out a draft, and work its guide says was not done at BIT', async () => {
    await createRecord(guide, 'studentsguided', taken({ studentName: 'Draft Student', rollNo: 'D/1/19', examGiven: 'NET', examRegistrationNo: 'NET-1' }), 'draft');
    await createRecord(guide, 'studentsguided', taken({ studentName: 'Elsewhere Student', rollNo: 'E/1/19', examGiven: 'NET', examRegistrationNo: 'NET-2', affiliatedToBit: 'No' }), 'submit');
    const names = (await facultyExamEntries(cdc)).map((e) => e.studentName);
    expect(names).not.toContain('Draft Student');
    expect(names).not.toContain('Elsewhere Student');
  });

  it('follows a correction by the guide at once', async () => {
    const rec = await createRecord(guide, 'studentsguided', taken({ studentName: 'Typo Name', rollNo: 'T/1/19', examGiven: 'GRE', examRegistrationNo: 'GRE-1' }), 'submit');
    const view = await getRecord(guide, 'studentsguided', rec.id);
    await updateRecord(guide, 'studentsguided', rec.id, { ...view.editValues, studentName: 'Right Name' }, 'submit');
    const names = (await facultyExamEntries(cdc)).map((e) => e.studentName);
    expect(names).toContain('Right Name');
    expect(names).not.toContain('Typo Name');
  });

  it('reaches the CDC report’s sheet', async () => {
    const report = await generateReport(cdc, readReportRequest(cdc, 'naac', q({ from: '2023', to: '2023', workbook: 'cdc' })), []);
    const cells: string[] = [];
    report.workbook.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => cells.push(c.text))));
    expect(cells).toContain('Asha Rao');
    expect(cells.filter((c) => c === 'Ravi Kumar')).toHaveLength(1);                // one student, even with two exams
    expect(cells).toContain('GATE 2023; CAT 2023');                                  // and both exams on his row
    expect(cells.some((c) => c === 'Total number of students who qualified')).toBe(true);
  });
});

describe('who may see it, and what', () => {
  it('shows CDC and IQAC the same list, and nobody else, not even a head of department or the guide', async () => {
    expect((await facultyExamEntries(admin)).length).toBeGreaterThan(0);
    for (const who of [guide, guide2, hod]) {
      await expect(facultyExamEntries(who)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(facultyExamsNotInList(who)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('never carries a student’s e-mail, phone, or pay', async () => {
    const all = JSON.stringify([await facultyExamEntries(cdc), await facultyExamsNotInList(cdc)]);
    expect(all).not.toContain('ravi.private@example.com');
    expect(all).not.toContain('9876500000');
    expect(all).not.toMatch(/email|phone|payPackage|offerLetter/i);
  });
});
