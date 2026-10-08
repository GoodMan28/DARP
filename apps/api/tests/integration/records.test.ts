import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import {
  createRecord, updateRecord, getRecord, listRecords, transitionRecord, deleteRecord,
  setNilDeclaration, getNilDeclaration, statusCounts,
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
  indexing: 'SCIE',
  year: '2024',
  issn: '2168-7161',
  bibliographic: 'A. K. Verma. "Edge scheduling." IEEE TCC (2024).',
});

/** A complete Patents record; `tag` keeps each application number unique. */
const patentNos: Record<string, string> = {};
const patent = (tag: string) => ({
  inventors: 'A. K. Verma',
  applicant: 'Birla Institute of Technology, Mesra',
  country: 'India',
  applicationNo: (patentNos[tag] ??= `202331${String(100000 + Object.keys(patentNos).length).padStart(6, '0')}`),
  title: `Patent ${tag}`,
  status: 'Published',
  statusDate: '2023-05-01',
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

// The generic verify/return workflow runs on Patents, which still go to DRIE for checking.
// Publications are approved on submission instead (tests/integration/lookup.test.ts).
describe('workflow', () => {
  it('walks draft → submitted → verified → approved with the right actors', async () => {
    const { id } = await createRecord(faculty, 'patents', patent('w'), 'draft');
    await expect(transitionRecord(drie, 'patents', id, 'verify'))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect((await transitionRecord(faculty, 'patents', id, 'submit')).status).toBe('submitted');
    await expect(transitionRecord(faculty, 'patents', id, 'verify'))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await transitionRecord(drie, 'patents', id, 'verify')).status).toBe('verified');
    await expect(transitionRecord(drie, 'patents', id, 'approve'))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await transitionRecord(admin, 'patents', id, 'approve')).status).toBe('approved');
    expect((await transitionRecord(admin, 'patents', id, 'unlock')).status).toBe('verified');
  });

  it('freezes a submitted record against owner edits, and frees it again on return', async () => {
    const { id } = await createRecord(faculty, 'patents', patent('f'), 'submit');
    await expect(updateRecord(faculty, 'patents', id, patent('f'), 'draft'))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(transitionRecord(drie, 'patents', id, 'return'))
      .rejects.toMatchObject({ code: 'VALIDATION' });
    await transitionRecord(drie, 'patents', id, 'return', 'ISSN does not match the journal.');
    await expect(updateRecord(faculty, 'patents', id, patent('f'), 'draft')).resolves.toBeDefined();
  });

  it('records a remark on the returned record and in its history', async () => {
    const { id } = await createRecord(faculty, 'patents', patent('r'), 'submit');
    await transitionRecord(drie, 'patents', id, 'return', 'Attach the DOI landing page.');
    const read = await getRecord(faculty, 'patents', id);
    expect(read.returnedRemark).toBe('Attach the DOI landing page.');
    expect(read.history.at(-1)).toMatchObject({ toStatus: 'returned' });
  });

  it('refuses to submit an incomplete record', async () => {
    const { id } = await createRecord(faculty, 'patents', { title: 'Half a record' }, 'draft');
    await expect(transitionRecord(faculty, 'patents', id, 'submit'))
      .rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('frees the DOI again after a soft delete', async () => {
    const { id } = await createRecord(faculty, 'publications', paper('10.1016/reuse'), 'draft');
    await deleteRecord(faculty, 'publications', id);
    await expect(createRecord(otherFaculty, 'publications', paper('10.1016/reuse'), 'draft'))
      .resolves.toBeDefined();
  });

  it('refuses to delete a record that has left the owner’s hands', async () => {
    const { id } = await createRecord(faculty, 'patents', patent('keep'), 'submit');
    await expect(deleteRecord(faculty, 'patents', id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('nil returns', () => {
  it('records and clears "nothing to report this cycle"', async () => {
    expect(await getNilDeclaration(faculty, 'patents')).toBe(false);
    await setNilDeclaration(faculty, 'patents', true);
    expect(await getNilDeclaration(faculty, 'patents')).toBe(true);
    await setNilDeclaration(faculty, 'patents', false);
    expect(await getNilDeclaration(faculty, 'patents')).toBe(false);
  });

  it('does not let somebody declare a module that is not theirs to own', async () => {
    await expect(setNilDeclaration(hod, 'publications', true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
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
