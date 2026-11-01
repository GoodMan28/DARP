import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadTestInstitutes } from '../helpers/institutes';
import { fullProfile } from '../helpers/profile';
import {
  createRecord, updateRecord, getRecord, listRecords, transitionRecord, deleteRecord,
  correctionsFor, listDeletedRecords, restoreRecord, setNilDeclaration, getNilDeclarations,
} from '@/server/records/service';
import { counterValuesFor } from '@/server/rollups/completion';
import type { SessionUser } from '@/server/auth/session';

let faculty: SessionUser;
let quiet: SessionUser;      // never saves a profile
let meTech: SessionUser;     // another department
let hod: SessionUser;
let otherHod: SessionUser;
let drie: SessionUser;
let dofa: SessionUser;
let admin: SessionUser;

const consultancy = (revenue: string) => ({
  recordType: 'Consultancy', consultants: 'A. K. Verma', projectTitle: 'History', agency: 'Tata Steel', financialYear: '2024', revenue, affiliatedToBit: 'Yes',
});

const grant = (tag: string, extra: Record<string, unknown> = {}) => ({
  role: 'PI',
  title: `Grant ${tag}`,
  agency: 'SERB', agencyCode: 'ROR-07serb001',
  agencyCategory: 'Government',
  durationYears: '3',
  sanctionDate: '2025-02-12',
  amount: '1200000',
  ...extra,
});

beforeAll(async () => {
  await truncateAll();
  await loadTestInstitutes();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  quiet = await makeUser({ role: 'faculty', dept: 'CSE' });
  meTech = await makeUser({ role: 'faculty', dept: 'ME' });
  hod = await makeUser({ role: 'hod', dept: 'CSE' });
  otherHod = await makeUser({ role: 'hod', dept: 'ME' });
  drie = await makeUser({ role: 'drie' });
  dofa = await makeUser({ role: 'dofa' });
  admin = await makeUser({ role: 'admin' });
});

afterAll(async () => { await closeDb(); });

describe('edit history is visible to everyone who can open the record', () => {
  it('shows an edited record’s history to the HOD and the office, not only the owner', async () => {
    const { id } = await createRecord(faculty, 'consultancy', consultancy('1000'), 'submit');
    await updateRecord(faculty, 'consultancy', id, consultancy('2000'), 'submit');
    for (const viewer of [faculty, hod, drie, admin]) {
      const read = await getRecord(viewer, 'consultancy', id);
      expect(read.edits.length, viewer.role).toBe(1);
    }
  });
});

describe('returned records say who sent them back', () => {
  it('lists the returning role on the list and the record', async () => {
    const { id } = await createRecord(faculty, 'grants', grant('returned'), 'submit');
    await transitionRecord(drie, 'grants', id, 'return', '**Check** the amount');
    const row = (await listRecords(hod, 'grants', {})).rows.find((r) => r.id === id)!;
    expect(row.status).toBe('returned');
    expect(row.isMine).toBe(false);
    expect(row.returnedByRole).toBe('drie');
    expect((await getRecord(hod, 'grants', id)).canEdit).toBe(false);
  });

  it('flags a correction with the fields changed, or as resubmitted unchanged', async () => {
    const a = await createRecord(faculty, 'grants', grant('changed'), 'submit');
    const b = await createRecord(faculty, 'grants', grant('same'), 'submit');
    await transitionRecord(drie, 'grants', a.id, 'return', 'Fix the agency');
    await transitionRecord(drie, 'grants', b.id, 'return', 'Look again');
    await updateRecord(faculty, 'grants', a.id, grant('changed', { agency: 'DST', agencyCode: 'ROR-08tata001' }), 'submit');
    await updateRecord(faculty, 'grants', b.id, grant('same'), 'submit');
    const rows = await correctionsFor(drie);
    expect(rows.find((r) => r.id === a.id)!.changed).toContain('Name of the funding agency');
    expect(rows.find((r) => r.id === b.id)!.changed).toEqual([]);
  });
});

describe('delete rules', () => {
  it('does not let the owner return their own record, or a HOD delete another’s', async () => {
    const { id } = await createRecord(faculty, 'grants', grant('own'), 'submit');
    await expect(transitionRecord(faculty, 'grants', id, 'return', 'x')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(deleteRecord(hod, 'grants', id, 'not allowed to')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets IQAC see the deleted record with its reason, and restore it', async () => {
    const { id } = await createRecord(faculty, 'grants', grant('restore'), 'submit');
    expect((await getRecord(faculty, 'grants', id)).deleteNeedsReason).toBe(true);
    await deleteRecord(faculty, 'grants', id, 'Entered twice by mistake');
    await expect(getRecord(faculty, 'grants', id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const gone = (await listDeletedRecords(admin)).find((r) => r.id === id)!;
    expect(gone.reason).toBe('Entered twice by mistake');
    await expect(listDeletedRecords(faculty)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await restoreRecord(admin, id);
    expect((await getRecord(faculty, 'grants', id)).status).toBe('approved');
  });

  it('shows IQAC the delete rule on a draft owned by someone else', async () => {
    const { id } = await createRecord(faculty, 'grants', grant('draft'), 'draft');
    const read = await getRecord(admin, 'grants', id);
    expect(read.canDelete).toBe(true);
    expect(read.deleteNeedsReason).toBe(true);
  });
});

describe('the Faculty Profile roster', () => {
  it('lists every faculty member in the HOD’s department, including those with no profile', async () => {
    await createRecord(faculty, 'profile', fullProfile(), 'submit');
    const rows = (await listRecords(hod, 'profile', {})).rows;
    const quietRow = rows.find((r) => r.ownerName === quiet.name)!;
    expect(quietRow.noRecord).toBe(true);
    expect(rows.find((r) => r.ownerName === faculty.name)!.noRecord).toBeUndefined();
    expect(rows.some((r) => r.ownerName === meTech.name)).toBe(false);
  });

  it('filters to the people who have not filled it in', async () => {
    const rows = (await listRecords(hod, 'profile', { status: 'none' })).rows;
    expect(rows.every((r) => r.noRecord)).toBe(true);
    expect(rows.some((r) => r.ownerName === quiet.name)).toBe(true);
  });

  it('shows DoFA and IQAC every department', async () => {
    for (const viewer of [dofa, admin]) {
      const names = (await listRecords(viewer, 'profile', { pageSize: 100 })).rows.map((r) => r.ownerName);
      expect(names).toEqual(expect.arrayContaining([quiet.name, meTech.name]));
    }
  });

  it('lets a HOD keep a profile of their own, which they can never return', async () => {
    const made = await createRecord(hod, 'profile', fullProfile(), 'submit');
    const mine = await listRecords(hod, 'profile', { mine: true });
    expect(mine.rows.map((r) => r.id)).toContain(made.id);
    expect(mine.rows.every((r) => r.isMine)).toBe(true);
    await expect(transitionRecord(hod, 'profile', made.id, 'return', 'no')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('shows a faculty member only their own profile', async () => {
    const rows = (await listRecords(faculty, 'profile', {})).rows;
    expect(rows.every((r) => r.isMine)).toBe(true);
  });
});

describe('MoUs are seen by department', () => {
  it('lets a faculty member read their own department’s MoUs only', async () => {
    const mou = (tag: string) => ({
      organisation: `Org ${tag}`, institutionName: 'Institute', durationYears: '2', signingDate: '2024-08-01', participants: '10',
      purpose: 'Research',
    });
    const mine = await createRecord(hod, 'mous', mou('cse'), 'draft');
    const theirs = await createRecord(otherHod, 'mous', mou('me'), 'draft');
    const seen = (await listRecords(faculty, 'mous', {})).rows.map((r) => r.id);
    expect(seen).toContain(mine.id);
    expect(seen).not.toContain(theirs.id);
    await expect(getRecord(faculty, 'mous', theirs.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('dates and durations', () => {
  it('files a grant under the financial year of its sanction date and shows the project period', async () => {
    const { id } = await createRecord(faculty, 'grants', grant('fy'), 'submit');
    const read = await getRecord(faculty, 'grants', id);
    expect(read.periodLabel).toBe('FY 2024-25');
    expect(read.derived.projectPeriod).toBe('12-02-2025 to 11-02-2028 (3 years) · FY 2024-25 to FY 2027-28');
  });

  it('refuses a future sanction date and a duration written as text', async () => {
    const future = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
    await expect(createRecord(faculty, 'grants', grant('future', { sanctionDate: future }), 'submit'))
      .rejects.toMatchObject({ fields: { sanctionDate: 'This date is in the future.' } });
    await expect(createRecord(faculty, 'grants', grant('text', { durationYears: '7 years' }), 'submit'))
      .rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(createRecord(faculty, 'grants', grant('half', { durationYears: '1.5' }), 'submit'))
      .resolves.toBeDefined();
  });

  it('lets a draft be saved with a duration still to enter', async () => {
    await expect(createRecord(faculty, 'grants', grant('later', { durationYears: '' }), 'draft')).resolves.toBeDefined();
  });
});

describe('a HOD is also a faculty member', () => {
  it('enters their own records in the faculty modules, which the office checks and the HOD cannot return', async () => {
    const own = await createRecord(hod, 'grants', grant('hod-own'), 'submit');
    expect((await getRecord(hod, 'grants', own.id)).isMine).toBe(true);
    await expect(transitionRecord(hod, 'grants', own.id, 'return', 'no')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(transitionRecord(drie, 'grants', own.id, 'return', 'Check the sanction letter')).resolves.toBeDefined();
    const { id: other } = await createRecord(faculty, 'grants', grant('dept-colleague'), 'submit');
    await expect(transitionRecord(hod, 'grants', other, 'return', 'Check the agency')).resolves.toBeDefined();
  });

  it('does not show a HOD the records of another department', async () => {
    const theirs = await createRecord(meTech, 'grants', grant('me-dept'), 'submit');
    await expect(getRecord(hod, 'grants', theirs.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('year ranges never hide a record', () => {
  it('lists records of every year, whatever the default range is', async () => {
    const old = await createRecord(faculty, 'grants', grant('old-2012', { sanctionDate: '2012-05-20' }), 'submit');
    const ids = (await listRecords(faculty, 'grants', { pageSize: 100 })).rows.map((r) => r.id);
    expect(ids).toContain(old.id);
    const read = await getRecord(faculty, 'grants', old.id);
    expect(read.periodLabel).toBe('FY 2012-13');
  });

  it('counts only the chosen years on the profile, but all years since joining', async () => {
    const mk = (tag: string, date: string) => createRecord(quiet, 'grants', grant(tag, { sanctionDate: date, amount: '100' }), 'submit');
    await mk('range-2021', '2021-06-01');
    await mk('range-2023', '2023-06-01');
    const pick = (v: Awaited<ReturnType<typeof counterValuesFor>>, key: string) => v.computed.find((c) => c.key === key)!.value;
    const inYear = await counterValuesFor(quiet, quiet.id, { from: 2021, to: 2021 });
    const wide = await counterValuesFor(quiet, quiet.id, { from: 2021, to: 2024 });
    expect(pick(inYear, 'grants.count.pi.cycle')).toBe(1);
    expect(pick(wide, 'grants.count.pi.cycle')).toBe(2);
    expect(pick(inYear, 'grants.count.pi.sinceJoining')).toBe(pick(wide, 'grants.count.pi.sinceJoining'));
    expect(inYear.computed.find((c) => c.key === 'grants.count.pi.cycle')!.label).toMatch(/FY 2021/);
  });

  it('keeps a profile and a nil declaration per person and per year', async () => {
    await setNilDeclaration(faculty, 'patents', true, 2022);
    expect(await getNilDeclarations(faculty, 'patents')).toContain(2022);
    await setNilDeclaration(faculty, 'patents', false, 2022);
  });
});
