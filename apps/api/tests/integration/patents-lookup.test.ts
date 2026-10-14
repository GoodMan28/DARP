import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { createRecord, updateRecord, getRecord, transitionRecord, listRecords } from '@/server/records/service';
import { uploadEvidence } from '@/server/evidence/service';
import { lookupForForm } from '@/server/lookup/form';
import { patentApplications, patentGrants, patentJournalParts } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';

/*
 * Patents → Fetch details reads the portal's own index of the Patent Office Journal. These tests
 * put a few made-up journal entries in that index (numbers no real patent has) and take them out
 * again afterwards; nothing is fetched from IP India.
 */

let faculty: SessionUser;
let drie: SessionUser;

const PUBLISHED = '202331900001';     // published, not granted
const GRANTED_APP = '202331900002';   // published and granted
const GRANTED_NO = '999902';
const GRANT_ONLY_APP = '201731900003'; // granted; its publication is older than the index
const GRANT_ONLY_NO = '999903';
const NO_INVENTORS = '202331900004';  // "Inventor: NA", inventors among the applicants
const STRANGER = '202331900005';      // the owner is not an inventor
const UNKNOWN = '202331900099';       // not in the index
const APPS = [PUBLISHED, GRANTED_APP, NO_INVENTORS, STRANGER];
const PART = 'test-part-patents-lookup.pdf';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
const evidence = async () => (await uploadEvidence(faculty, {
  bytes: PDF, fileName: 'grant.pdf', declaredMime: 'application/pdf', fieldKey: 'evidence', moduleKey: 'patents',
})).id;

/** The form after Fetch details: what the browser sends back on save. */
async function fetched(number: string, over: Record<string, unknown> = {}) {
  const res = await lookupForForm(faculty, 'patents', number);
  return { ...res.fill, applicationNo: number, category: 'Engineering', evidence: await evidence(), ...over };
}

beforeAll(async () => {
  await truncateAll();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  drie = await makeUser({ role: 'drie' });
  await cleanIndex();
  const me = { name: `Dr. ${faculty.name.replace(/ \d+$/, '')}`, bit: true };
  await db.insert(patentApplications).values([
    {
      applicationNo: PUBLISHED, title: 'A drying apparatus', filedDate: '2023-12-15', publishedDate: '2024-04-19',
      applicants: ['Birla Institute of Technology Mesra'], inventors: [me, { name: 'Bijendra Sahoo', bit: true }], issue: '16/2024',
    },
    {
      applicationNo: GRANTED_APP, title: 'A sensing device', filedDate: '2022-01-10', publishedDate: '2022-07-01',
      applicants: ['Birla Institute of Technology Mesra'], inventors: [me], issue: '27/2022',
    },
    {
      applicationNo: NO_INVENTORS, title: 'A network method', filedDate: '2023-05-05', publishedDate: '2023-11-10',
      applicants: ['Cisco Technology, Inc.', `${faculty.name.replace(/ \d+$/, '').split(' ').reverse().join(', ')}`],
      inventors: [], issue: '45/2023',
    },
    {
      applicationNo: STRANGER, title: 'Somebody else\'s invention', filedDate: '2023-02-02', publishedDate: '2023-08-04',
      applicants: ['Another Institute'], inventors: [{ name: 'Anil Sharma', bit: false }], issue: '31/2023',
    },
  ]);
  await db.insert(patentGrants).values([
    {
      patentNo: GRANTED_NO, applicationNo: GRANTED_APP, title: 'A SENSING DEVICE', patentee: 'BIRLA INSTITUTE OF TECHNOLOGY',
      filedDate: '2022-01-10', publishedDate: '2022-07-01', office: 'KOLKATA', grantPublishedDate: '2024-04-19', issue: '16/2024',
    },
    {
      patentNo: GRANT_ONLY_NO, applicationNo: GRANT_ONLY_APP, title: 'AN OLD INVENTION', patentee: 'Birla Institute of Technology',
      filedDate: '2017-03-03', publishedDate: '2018-09-07', office: 'KOLKATA', grantPublishedDate: '2024-04-19', issue: '16/2024',
    },
  ]);
  await db.insert(patentJournalParts).values({
    fileName: PART, issue: '16/2024', issueDate: '2024-04-19', status: 'indexed', applications: 4, grants: 2,
  });
});

async function cleanIndex() {
  await db.delete(patentApplications).where(inArray(patentApplications.applicationNo, APPS));
  await db.delete(patentGrants).where(inArray(patentGrants.patentNo, [GRANTED_NO, GRANT_ONLY_NO]));
  await db.delete(patentJournalParts).where(inArray(patentJournalParts.fileName, [PART]));
}

afterAll(async () => {
  await cleanIndex();
  await closeDb();
});

describe('Fetch details on a patent number', () => {
  it('fills a published application from the Patent Office Journal and locks what it fetched', async () => {
    const res = await lookupForForm(faculty, 'patents', 'IN 202331900001 A');
    expect(res).toMatchObject({ found: true, source: 'ipindia', authoritative: true });
    expect(res.fill).toMatchObject({
      title: 'A drying apparatus', applicant: 'Birla Institute of Technology Mesra', country: 'India',
      filedDate: '2023-12-15', status: 'Published', statusDate: '2024-04-19',
    });
    expect(res.fill.inventors).toContain('Bijendra Sahoo');
    expect(res.locked).toEqual(expect.arrayContaining(['title', 'applicant', 'country', 'filedDate', 'status', 'statusDate']));
    expect(res.locked).not.toContain('inventors');      // the inventor list stays open, as authors do
    expect(res.notes.at(-1)).toContain('Everything matches');
  });

  it('finds a granted patent by its patent number too, as Awarded/Granted on the grant\'s journal date', async () => {
    const res = await lookupForForm(faculty, 'patents', GRANTED_NO);
    expect(res.fill).toMatchObject({ title: 'A sensing device', status: 'Awarded/Granted', statusDate: '2024-04-19' });
  });

  it('says which journal issues were read when a number is not in them', async () => {
    const res = await lookupForForm(faculty, 'patents', UNKNOWN);
    expect(res.found).toBe(false);
    expect(res.notes.join(' ')).toContain('not in the Patent Office Journal issues the portal has read (19 April 2024 to');
  });
});

describe('patents follow the same flow as publications', () => {
  it('approves a fully matching patent on submission, with nothing to check', async () => {
    const { id, status } = await createRecord(faculty, 'patents', await fetched(PUBLISHED), 'submit');
    expect(status).toBe('approved');
    const read = await getRecord(faculty, 'patents', id);
    expect(read.verification).toMatchObject({ source: 'ipindia', autoApproved: true, reasons: [] });
    expect(read.lockedFields).toEqual(expect.arrayContaining(['title', 'status', 'statusDate']));
    expect(read.history[read.history.length - 1]!.actorName).toBe('DARP automatic check');
  });

  it('needs evidence on every patent', async () => {
    await expect(createRecord(faculty, 'patents', await fetched(GRANTED_APP, { evidence: '' }), 'submit'))
      .rejects.toMatchObject({ code: 'VALIDATION', fields: { evidence: expect.any(String) } });
  });

  it('refuses to submit when the owner is not among the inventors', async () => {
    await expect(createRecord(faculty, 'patents', await fetched(STRANGER), 'submit'))
      .rejects.toMatchObject({ code: 'VALIDATION', fields: { inventors: expect.stringContaining('must be in the inventor list') } });
  });

  it('keeps a changed detail, records the journal\'s value, and makes it a point to check', async () => {
    const { id, status } = await createRecord(
      faculty, 'patents', await fetched(GRANTED_APP, { title: 'A better sensing device' }), 'submit',
    );
    expect(status).toBe('approved');
    const read = await getRecord(drie, 'patents', id);
    expect(read.verification?.fields).toEqual({ title: { origin: 'changed', fetched: 'A sensing device' } });
    expect(read.verification?.reasons.join(' ')).toContain('the Patent Office Journal says "A sensing device"');
    expect((await listRecords(drie, 'patents', { check: true, pageSize: 50 })).rows.map((r) => r.id)).toContain(id);
  });

  it('takes a patent the journal does not have, typed by hand, as a point to check', async () => {
    const { id, status } = await createRecord(faculty, 'patents', {
      applicationNo: UNKNOWN, inventors: faculty.name, applicant: 'BIT Mesra', country: 'India',
      title: 'Typed by hand', status: 'Published', statusDate: '2025-01-03', evidence: await evidence(),
    }, 'submit');
    expect(status).toBe('approved');
    const read = await getRecord(drie, 'patents', id);
    expect(read.verification?.source).toBeNull();
    expect(read.verification?.reasons.join(' ')).toContain('not found in the Patent Office Journal');
  });

  it('takes a patent filed abroad by hand', async () => {
    const { id } = await createRecord(faculty, 'patents', {
      applicationNo: 'US 10,123,456', inventors: faculty.name, applicant: 'BIT Mesra', country: 'United States',
      title: 'A US patent', status: 'Awarded/Granted', statusDate: '2024-02-02', evidence: await evidence(),
    }, 'submit');
    expect((await getRecord(faculty, 'patents', id)).data.applicationNo).toBe('US10123456');
  });

  it('a grant whose application is older than the index: inventors typed, said so once', async () => {
    const values = await fetched(GRANT_ONLY_NO, { inventors: faculty.name });
    expect(values).toMatchObject({ title: 'AN OLD INVENTION', status: 'Awarded/Granted' });
    const { id } = await createRecord(faculty, 'patents', values, 'submit');
    const reasons = (await getRecord(drie, 'patents', id)).verification?.reasons ?? [];
    expect(reasons.join(' ')).toContain('Only the grant was found');
    expect(reasons.join(' ')).not.toContain('added by hand');
  });

  it('takes the individual applicants as inventors when the journal lists none', async () => {
    const res = await lookupForForm(faculty, 'patents', NO_INVENTORS);
    expect(res.fill.inventors).toBe(faculty.name.replace(/ \d+$/, ''));
    expect(res.notes.join(' ')).toContain('the individual applicants were taken as the inventors');
  });

  it('DRIE can return an approved patent; the resubmission goes to DRIE, whose Verify is final', async () => {
    const [record] = (await listRecords(faculty, 'patents', { pageSize: 50 })).rows
      .filter((r) => r.data.applicationNo === PUBLISHED);
    expect((await transitionRecord(drie, 'patents', record!.id, 'return', 'Attach the grant certificate.')).status).toBe('returned');
    const again = await updateRecord(faculty, 'patents', record!.id, await fetched(PUBLISHED), 'submit');
    expect(again.status).toBe('submitted');
    expect((await transitionRecord(drie, 'patents', record!.id, 'verify')).status).toBe('approved');
  });
});
