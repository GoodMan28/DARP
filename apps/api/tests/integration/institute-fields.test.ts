import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadTestInstitutes } from '../helpers/institutes';
import { createRecord, getRecord, updateRecord } from '@/server/records/service';
import { validateRecord } from '@/server/records/validate';
import { getList } from '@/server/records/masterLists';
import { institutions } from '@/server/db/schema';
import { MODULES } from '@darp/shared/modules';
import { generateWorkbookFromRows } from '@/server/export/excel';
import type { ModuleConfig } from '@darp/shared/modules/types';
import type { SessionUser } from '@/server/auth/session';

/* Phase 6: a college or university is chosen from the directory, never typed. */

let faculty: SessionUser;
let programType: string;
const fdp = MODULES.fdpattended!;

const form = (over: Record<string, unknown> = {}) => ({
  programType, organisingInstitution: 'whatever the browser sends', organisingInstitutionCode: 'U-0050',
  startDate: '2025-03-03', endDate: '2025-03-07', durationDays: '5', ...over,
});

beforeAll(async () => {
  await truncateAll();
  await loadTestInstitutes();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  programType = (await getList('fdpProgramTypes'))[0] ?? 'Refresher Course';
});
afterAll(async () => { await closeDb(); });

describe('an institute chosen from the directory', () => {
  it('is written from the directory, whatever the browser sent, with its ID beside it', async () => {
    const rec = await createRecord(faculty, 'fdpattended', form(), 'submit');
    const read = await getRecord(faculty, 'fdpattended', rec.id);
    expect(read.data.organisingInstitution).toBe('Indian Institute of Technology, Kharagpur, West Bengal, India');
    expect(read.data.organisingInstitutionCode).toBe('U-0050');
  });

  it('refuses a code the directory does not have', async () => {
    await expect(createRecord(faculty, 'fdpattended', form({ organisingInstitutionCode: 'U-9999', startDate: '2025-04-04', endDate: '2025-04-08' }), 'draft'))
      .rejects.toMatchObject({ fields: { organisingInstitution: 'Choose the institute from the list again.' } });
  });

  it('takes an institute merged into another as the one it was merged into', async () => {
    await db.update(institutions).set({ status: 'merged', mergedInto: 'U-0391' }).where(eq(institutions.code, 'C-1111'));
    const rec = await createRecord(faculty, 'fdpattended', form({ organisingInstitutionCode: 'C-1111', startDate: '2025-05-05', endDate: '2025-05-09' }), 'submit');
    const read = await getRecord(faculty, 'fdpattended', rec.id);
    expect(read.data.organisingInstitutionCode).toBe('U-0391');
    await db.update(institutions).set({ status: 'active', mergedInto: null }).where(eq(institutions.code, 'C-1111'));
  });

  it('is the duplicate guard: the same institute and date is the same programme, however it was spelled', async () => {
    await expect(createRecord(faculty, 'fdpattended', form({ organisingInstitution: 'IIT KGP' }), 'submit'))
      .rejects.toMatchObject({ code: expect.stringMatching(/DUPLICATE|CONFLICT/) });
  });

  it('is refused for a place outside BIT when the field says so, and accepted for any other', async () => {
    const outside: ModuleConfig = { ...fdp, fields: fdp.fields.map((f) => (f.key === 'organisingInstitution' ? { ...f, excludeHome: true } : f)) };
    const bit = await validateRecord(outside, form({ organisingInstitutionCode: 'U-0202' }), 'submit');
    expect(bit.errors.organisingInstitution).toBe('Choose an institute outside BIT.');
    const iit = await validateRecord(outside, form(), 'submit');
    expect(iit.errors.organisingInstitution).toBeUndefined();
    expect((await validateRecord(fdp, form({ organisingInstitutionCode: 'U-0202' }), 'submit')).errors.organisingInstitution).toBeUndefined();
  });

  it('may be a foreign university or a company', async () => {
    const paris = await validateRecord(fdp, form({ organisingInstitutionCode: 'ROR-04paris01' }), 'submit');
    expect(paris.data.organisingInstitution).toBe('Université de Paris, Île-de-France, France');
    const acme = await validateRecord(fdp, form({ organisingInstitutionCode: 'ROR-05acme001' }), 'submit');
    expect(acme.data.organisingInstitution).toBe('Acme Robotics, Inc., Texas, United States');
  });
});

describe('a name typed before the directory existed', () => {
  it('stays in a draft, but a submission asks for a choice from the list; choosing fixes it', async () => {
    const old = { programType, organisingInstitution: 'IIT Kgp, typed long ago', startDate: '2024-01-10', endDate: '2024-01-12', durationDays: '3' };
    const draft = await createRecord(faculty, 'fdpattended', old, 'draft');
    expect((await getRecord(faculty, 'fdpattended', draft.id)).data.organisingInstitution).toBe('IIT Kgp, typed long ago');
    await expect(updateRecord(faculty, 'fdpattended', draft.id, old, 'submit'))
      .rejects.toMatchObject({ fields: { organisingInstitution: 'Choose this institute from the list, or add it.' } });
    await updateRecord(faculty, 'fdpattended', draft.id, { ...old, organisingInstitutionCode: 'U-0050' }, 'submit');
    expect((await getRecord(faculty, 'fdpattended', draft.id)).data).toMatchObject({
      organisingInstitution: 'Indian Institute of Technology, Kharagpur, West Bengal, India', organisingInstitutionCode: 'U-0050',
    });
  });

  it('is required where the field is required', async () => {
    const r = await validateRecord(fdp, form({ organisingInstitution: '', organisingInstitutionCode: '' }), 'submit');
    expect(r.errors.organisingInstitution).toBe('Name of the Organising Institution is required.');
    expect((await validateRecord(fdp, form({ organisingInstitution: '', organisingInstitutionCode: '' }), 'draft')).errors.organisingInstitution).toBeUndefined();
  });
});

describe('where the institute fields are', () => {
  it('are the four qualification institutes, FDPs, students going on to study, QS contacts and MoUs', () => {
    const where = Object.values(MODULES).flatMap((m) => m.fields.filter((f) => f.type === 'institution').map((f) => `${m.key}.${f.key}`)).sort();
    expect(where).toEqual([
      'fdpattended.organisingInstitution', 'mous.institutionName', 'mous.organisation', 'profile.pgInstitution', 'profile.phdInstitution',
      'profile.postdocInstitution', 'profile.ugInstitution', 'qscontacts.institution', 'studentsguided.institutionEnrolled',
    ]);
  });

  it('keep the ID in the Excel files for every module except the Profile sheet', () => {
    const idColumn = (m: string) => MODULES[m]!.fields.find((f) => f.type === 'institutionCode')!.exportAs;
    expect(idColumn('fdpattended')).toEqual({
      faculty: 'Name of the Organising Institution - Institute ID', dofa: 'Name of the Organising Institution - Institute ID',
    });
    expect(idColumn('profile')).toBeUndefined();
  });
});

describe('worked-out fields and date order', () => {
  it('counts the days of an FDP from its two dates, whatever the browser sent', async () => {
    const rec = await createRecord(faculty, 'fdpattended', form({ durationDays: '99', startDate: '2025-06-02', endDate: '2025-06-06' }), 'submit');
    expect((await getRecord(faculty, 'fdpattended', rec.id)).data.durationDays).toBe(5);
  });

  it('needs no days typed at all', async () => {
    const { durationDays: _drop, ...without } = form({ startDate: '2025-07-01', endDate: '2025-07-01' });
    const rec = await createRecord(faculty, 'fdpattended', without, 'submit');
    expect((await getRecord(faculty, 'fdpattended', rec.id)).data.durationDays).toBe(1);
  });

  it('refuses an end date before the start, in a draft too', async () => {
    for (const mode of ['draft', 'submit'] as const) {
      await expect(createRecord(faculty, 'fdpattended', form({ startDate: '2025-08-10', endDate: '2025-08-05' }), mode))
        .rejects.toMatchObject({ fields: { endDate: 'End Date cannot be before Start Date.' } });
    }
  });

  it('knows which date fields follow another', () => {
    const order = Object.values(MODULES).flatMap((m) => m.fields.filter((f) => f.notBefore).map((f) => `${m.key}.${f.key}>=${f.notBefore}`)).sort();
    expect(order).toEqual([
      'fdpattended.endDate>=startDate', 'fdporganised.endDate>=startDate', 'finsupport.endDate>=startDate', 'outreach.memberTo>=memberFrom',
    ]);
  });

  it('writes an FDP organised by a department with its two dates in one "from – to" column', async () => {
    const { workbook } = await generateWorkbookFromRows('hod', { includePii: false }, {
      fdporganised: [{ data: { title: 'T', startDate: '2025-03-03', endDate: '2025-03-07', internalFaculty: '4', externalFaculty: '2' }, ownerName: 'Dr X', department: 'CSE', profile: {} }],
    });
    const sheet = workbook.getWorksheet('FDPs')!;
    const cells: string[] = [];
    sheet.eachRow((row) => row.eachCell((c) => cells.push(c.text)));
    expect(cells).toContain('03-03-2025 – 07-03-2025');
  });
});

describe('QS contacts', () => {
  const contact = (over: Record<string, unknown> = {}) => ({
    title: 'Dr.', firstName: 'Claire', middleName: 'Marie', lastName: 'Dupont', designation: 'Professor', department: 'Physics',
    institution: 'x', institutionCode: 'ROR-04paris01', country: 'India', email: `claire${Math.random().toString(36).slice(2, 8)}@u-paris.fr`,
    specialisation: 'Optics', consentStatus: 'Not yet contacted', ...over,
  });

  it('keeps a middle name, and takes the country from the institution whatever the browser sent', async () => {
    const rec = await createRecord(faculty, 'qscontacts', contact(), 'submit');
    const read = await getRecord(faculty, 'qscontacts', rec.id);
    expect(read.data).toMatchObject({ middleName: 'Marie', country: 'France', institutionCode: 'ROR-04paris01' });
  });

  it('is not asked for a country at all', async () => {
    const { country: _drop, ...without } = contact();
    const rec = await createRecord(faculty, 'qscontacts', without, 'submit');
    expect((await getRecord(faculty, 'qscontacts', rec.id)).data.country).toBe('France');
  });

  it('keeps a typed country for an institution typed before the directory, in a draft', async () => {
    const rec = await createRecord(faculty, 'qscontacts', contact({ institutionCode: '', institution: 'Old University', country: 'Japan' }), 'draft');
    expect((await getRecord(faculty, 'qscontacts', rec.id)).data.country).toBe('Japan');
  });

  it('puts the middle name to the right of IQAC’s columns in Excel', async () => {
    const { workbook } = await generateWorkbookFromRows('faculty', { includePii: false }, {
      qscontacts: [{ data: contact(), ownerName: 'Dr X', department: 'CSE', profile: {} }],
    });
    const sheet = workbook.getWorksheet('QS Contacts')!;
    const heads: string[] = [];
    sheet.eachRow((row) => row.eachCell((c) => heads.push(c.text)));
    expect(heads).toEqual(expect.arrayContaining(['Middle Name', 'First Name', 'Last Name']));
  });
});
