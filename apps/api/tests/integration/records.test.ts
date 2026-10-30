import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import {
  createRecord, updateRecord, getRecord, listRecords, transitionRecord, deleteRecord,
  setNilDeclaration, getNilDeclarations, statusCounts, correctionsFor, acknowledgeCorrection,
} from '@/server/records/service';
import { departmentCompletion, verificationQueue } from '@/server/rollups/completion';
import type { SessionUser } from '@/server/auth/session';

let faculty: SessionUser;
let otherFaculty: SessionUser;
let hod: SessionUser;
let otherHod: SessionUser;
let drie: SessionUser;
let dofa: SessionUser;
let admin: SessionUser;

const paper = (doi: string) => ({
  doi,
  title: 'Edge scheduling',
  authors: 'A. K. Verma',
  journal: 'IEEE TCC',
  year: '2024',
  issn: '2168-7161',
  bibliographic: 'A. K. Verma. "Edge scheduling." IEEE TCC (2024).',
});

/** A module still checked by DRIE and approved by IQAC, with no automatic lookup. */
const WORKFLOW = 'consultancy';
/** A complete Consultancy record; `tag` keeps each one unique. */
const engagement = (tag: string) => ({
  recordType: 'Consultancy',
  consultants: 'A. K. Verma',
  projectTitle: `Project ${tag}`,
  agency: 'Tata Steel, Jamshedpur',
  financialYear: '2024',
  revenue: '250000',
});

beforeAll(async () => {
  await truncateAll();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  otherFaculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  hod = await makeUser({ role: 'hod', dept: 'CSE' });
  otherHod = await makeUser({ role: 'hod', dept: 'ME' });
  drie = await makeUser({ role: 'drie' });
  dofa = await makeUser({ role: 'dofa' });
  admin = await makeUser({ role: 'admin' });
});

afterAll(async () => { await closeDb(); });

describe('create and read', () => {
  it('creates a record owned by the actor', async () => {
    const { id, status } = await createRecord(faculty, 'publications', paper('10.1016/a'), 'draft');
    expect(status).toBe('draft');
    const read = await getRecord(faculty, 'publications', id);
    expect(read.data.title).toBe('Edge scheduling');
    expect(read.ownerName).toBe(faculty.name);
    expect(read.isMine).toBe(true);
  });

  it('refuses a duplicate DOI and names the existing owner', async () => {
    await expect(createRecord(otherFaculty, 'publications', paper('10.1016/a'), 'draft'))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('treats a DOI URL and a bare DOI as the same paper', async () => {
    await expect(
      createRecord(otherFaculty, 'publications', paper('https://doi.org/10.1016/A'), 'draft'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it("blocks a faculty member from reading another faculty member's record (IDOR)", async () => {
    const { id } = await createRecord(faculty, 'publications', paper('10.1016/b'), 'draft');
    await expect(getRecord(otherFaculty, 'publications', id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it("lets the HOD of the same department read it, but not another department's HOD", async () => {
    const { id } = await createRecord(faculty, 'publications', paper('10.1016/c'), 'draft');
    await expect(getRecord(hod, 'publications', id)).resolves.toBeDefined();
    await expect(getRecord(otherHod, 'publications', id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it("lists a department's records only to its own HOD, not to every HOD", async () => {
    const { id } = await createRecord(faculty, 'publications', paper('10.1016/c-list'), 'draft');
    expect((await listRecords(hod, 'publications', { pageSize: 100 })).rows.map((r) => r.id)).toContain(id);
    expect((await listRecords(otherHod, 'publications', { pageSize: 100 })).rows.map((r) => r.id)).not.toContain(id);
  });

  it("counts only the HOD's own department on the dashboard and the status chips", async () => {
    await createRecord(faculty, 'publications', paper('10.1016/c-count'), 'draft');
    const all = await statusCounts(admin, 'publications');
    const cse = await statusCounts(hod, 'publications');
    const me = await statusCounts(otherHod, 'publications');
    expect(cse.draft).toBeGreaterThan(0);
    expect(cse.draft).toBe(all.draft);                 // every record so far is CSE's
    expect(Object.values(me).every((n) => n === 0)).toBe(true);

    const [cseRow, ...rest] = await departmentCompletion(hod);
    expect(rest).toHaveLength(0);
    expect(cseRow!.departmentCode).toBe('CSE');
    const adminCse = (await departmentCompletion(admin)).find((d) => d.departmentCode === 'CSE');
    expect(cseRow!.records).toBe(adminCse!.records);
    const meRows = await departmentCompletion(otherHod);
    expect(meRows.map((d) => d.departmentCode)).toEqual(['ME']);
    expect(meRows[0]!.records).toBe(0);
    expect(await verificationQueue(hod)).toEqual([]);  // a HOD verifies nothing
  });

  it('does not let an unrelated office read a module it neither owns nor verifies', async () => {
    const { id } = await createRecord(faculty, 'publications', paper('10.1016/d'), 'draft');
    await expect(getRecord(dofa, 'publications', id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('scopes the list view per role', async () => {
    const mine = await listRecords(faculty, 'publications', {});
    const theirs = await listRecords(otherFaculty, 'publications', {});
    const deanView = await listRecords(drie, 'publications', {});
    expect(mine.total).toBeGreaterThan(0);
    expect(theirs.total).toBe(0);
    expect(deanView.total).toBe(mine.total);
  });

  it('reports status counts within the caller’s scope', async () => {
    const counts = await statusCounts(faculty, 'publications');
    expect(counts.draft).toBeGreaterThan(0);
    expect(await statusCounts(otherFaculty, 'publications')).toMatchObject({ draft: 0 });
  });

  it('returns NOT_FOUND for an unknown module rather than crashing', async () => {
    await expect(listRecords(faculty, 'no-such-module', {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// Every module approves on submission; the offices and HODs check afterwards and may return a record.
// Consultancy has no lookup, so it shows the plain path.
describe('workflow', () => {
  it('approves on submission, and lets the office return an approved record with a remark', async () => {
    const { id } = await createRecord(faculty, WORKFLOW, engagement('w'), 'draft');
    expect((await transitionRecord(faculty, WORKFLOW, id, 'submit')).status).toBe('approved');
    const read = await getRecord(faculty, WORKFLOW, id);
    expect(read.history.map((h) => h.toStatus)).toEqual(['submitted', 'approved']);
    await expect(transitionRecord(faculty, WORKFLOW, id, 'return', 'x')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(transitionRecord(drie, WORKFLOW, id, 'return')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await transitionRecord(drie, WORKFLOW, id, 'return', 'Attach the letter.')).status).toBe('returned');
  });

  it('lets a HOD return their own department\x27s record, and no other HOD', async () => {
    const { id } = await createRecord(faculty, WORKFLOW, engagement('hod'), 'submit');
    await expect(transitionRecord(otherHod, WORKFLOW, id, 'return', 'No.')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await transitionRecord(hod, WORKFLOW, id, 'return', 'Check the agency name.')).status).toBe('returned');
  });

  it('approves a corrected record again, flagged for whoever returned it until they look', async () => {
    const { id } = await createRecord(faculty, WORKFLOW, engagement('fix'), 'submit');
    await transitionRecord(drie, WORKFLOW, id, 'return', 'Wrong agency.');
    expect(await correctionsFor(drie)).toEqual([]);
    expect((await updateRecord(faculty, WORKFLOW, id, { ...engagement('fix'), agency: 'Tata Motors, Jamshedpur' }, 'submit')).status).toBe('approved');
    expect((await correctionsFor(drie)).map((c) => c.id)).toContain(id);
    await expect(acknowledgeCorrection(hod, WORKFLOW, id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await acknowledgeCorrection(drie, WORKFLOW, id);
    expect((await correctionsFor(drie)).map((c) => c.id)).not.toContain(id);
  });

  it('lets the owner edit an approved record and keeps every change in its history', async () => {
    const { id } = await createRecord(faculty, WORKFLOW, engagement('edit'), 'submit');
    const out = await updateRecord(faculty, WORKFLOW, id, { ...engagement('edit'), revenue: '300000' }, 'draft');
    expect(out.status).toBe('approved');                       // an approved record never goes back to draft
    const read = await getRecord(faculty, WORKFLOW, id);
    expect(read.data.revenue).toBe('300000');
    expect(read.edits).toHaveLength(1);
    expect(read.edits[0]!.actorName).toBe(faculty.name);
    expect(read.edits[0]!.changes).toEqual([
      expect.objectContaining({ key: 'revenue', from: '250000', to: '300000' }),
    ]);
    // Saving with nothing changed adds nothing.
    await updateRecord(faculty, WORKFLOW, id, { ...engagement('edit'), revenue: '300000' }, 'draft');
    expect((await getRecord(faculty, WORKFLOW, id)).edits).toHaveLength(1);
    // Nobody else may edit it.
    await expect(updateRecord(otherFaculty, WORKFLOW, id, engagement('edit'), 'draft')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('records a remark on the returned record and in its history', async () => {
    const { id } = await createRecord(faculty, WORKFLOW, engagement('r'), 'submit');
    await transitionRecord(drie, WORKFLOW, id, 'return', 'Attach the DOI landing page.');
    const read = await getRecord(faculty, WORKFLOW, id);
    expect(read.returnedRemark).toBe('Attach the DOI landing page.');
    expect(read.history.at(-1)).toMatchObject({ toStatus: 'returned' });
  });

  it('refuses to submit an incomplete record', async () => {
    const { id } = await createRecord(faculty, WORKFLOW, { projectTitle: 'Half a record' }, 'draft');
    await expect(transitionRecord(faculty, WORKFLOW, id, 'submit'))
      .rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('frees the DOI again after a soft delete', async () => {
    const { id } = await createRecord(faculty, 'publications', paper('10.1016/reuse'), 'draft');
    await deleteRecord(faculty, 'publications', id);
    await expect(createRecord(otherFaculty, 'publications', paper('10.1016/reuse'), 'draft'))
      .resolves.toBeDefined();
  });

  it('lets the owner delete an approved record, but only with a reason; IQAC always gives one', async () => {
    const { id } = await createRecord(faculty, WORKFLOW, engagement('keep'), 'submit');
    await expect(deleteRecord(faculty, WORKFLOW, id)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(deleteRecord(hod, WORKFLOW, id, 'not mine to delete')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(deleteRecord(admin, WORKFLOW, id)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(deleteRecord(faculty, WORKFLOW, id, 'Entered twice')).resolves.toBeDefined();
  });
});

describe('nil returns', () => {
  it('records and clears "nothing to report" for a year', async () => {
    expect(await getNilDeclarations(faculty, 'patents')).toEqual([]);
    await setNilDeclaration(faculty, 'patents', true, 2023);
    await setNilDeclaration(faculty, 'patents', true, 2024);
    expect(await getNilDeclarations(faculty, 'patents')).toEqual([2024, 2023]);
    await setNilDeclaration(faculty, 'patents', false, 2023);
    await setNilDeclaration(faculty, 'patents', false, 2024);
    expect(await getNilDeclarations(faculty, 'patents')).toEqual([]);
  });

  it('does not let somebody declare a module that is not theirs to own', async () => {
    // Publications are every professor's, DRIE's included; CDC's exam results are CDC's alone.
    await expect(setNilDeclaration(drie, 'exams', true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('personal data', () => {
  it('stores Aadhaar encrypted and never returns it in plaintext', async () => {
    const { id } = await createRecord(faculty, 'profile', {
      name: faculty.name,
      aadhaar: '234123412346',
    }, 'draft');
    const read = await getRecord(faculty, 'profile', id);
    expect(String(read.data.aadhaar)).toMatch(/^XXXX-XXXX-/);
    expect(String(read.data.aadhaar)).not.toContain('234123412346');
  });

  it('keeps the stored Aadhaar when the form sends it back blank', async () => {
    const list = await listRecords(faculty, 'profile', {});
    const id = list.rows[0]!.id;
    await updateRecord(faculty, 'profile', id, { name: faculty.name, aadhaar: '' }, 'draft');
    const read = await getRecord(faculty, 'profile', id);
    expect(String(read.data.aadhaar)).toMatch(/2346$/);
  });
});
