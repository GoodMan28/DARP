import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { createRecord, updateRecord, getRecord } from '@/server/records/service';
import { uploadEvidence } from '@/server/evidence/service';
import { refreshPatentRecords, autoUpdatesFor } from '@/server/records/patentRefresh';
import { patentApplications, patentGrants } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';

/*
 * A patent entered as Applied (the journal cannot show a pending application) moves forward by itself
 * as later journal issues are read. Made-up numbers; nothing is fetched from IP India.
 */

let faculty: SessionUser;
const A = '202331910001';
const B = '202331910002';
const NOS = [A, B];
const GRANT_NO = '999910';
const GRANT_NO_B = '999911';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

const evidence = async () => (await uploadEvidence(faculty, {
  bytes: PDF, fileName: 'receipt.pdf', declaredMime: 'application/pdf', fieldKey: 'evidence', moduleKey: 'patents',
})).id;

const applied = async (applicationNo: string, over: Record<string, unknown> = {}) => createRecord(faculty, 'patents', {
  applicationNo, inventors: faculty.name, applicant: 'BIT Mesra', country: 'India', title: `Patent ${applicationNo}`,
  status: 'Applied', filedDate: '2024-06-01', evidence: await evidence(), ...over,
}, 'submit');

const me = () => ({ name: faculty.name, bit: true });

async function clean() {
  await db.delete(patentApplications).where(inArray(patentApplications.applicationNo, NOS));
  await db.delete(patentGrants).where(inArray(patentGrants.patentNo, [GRANT_NO, GRANT_NO_B]));
}

beforeAll(async () => {
  await truncateAll();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  await clean();
});
afterAll(async () => { await clean(); await closeDb(); });

describe('patents move forward by themselves', () => {
  let id: string;

  it('enters an Applied patent by hand, dated by its filing date, with no patent number yet', async () => {
    const r = await applied(A);
    id = r.id;
    const read = await getRecord(faculty, 'patents', id);
    expect(read.data.status).toBe('Applied');
    expect(read.data.statusDate).toBe('2024-06-01');
    expect(read.data.patentNumber ?? '').toBe('');
    expect(read.status).toBe('approved');
  });

  it('does nothing while the journal does not have it', async () => {
    expect((await refreshPatentRecords()).moved).toBe(0);
  });

  it('moves to Published when the journal publishes the application', async () => {
    await db.insert(patentApplications).values({
      applicationNo: A, title: 'PUBLISHED TITLE', filedDate: '2024-06-01', publishedDate: '2025-01-10',
      applicants: ['BIT Mesra'], inventors: [me()], issue: '02/2025',
    });
    expect((await refreshPatentRecords()).moved).toBe(1);
    const read = await getRecord(faculty, 'patents', id);
    expect(read.data).toMatchObject({ status: 'Published', publishedDate: '2025-01-10', statusDate: '2025-01-10', title: 'Patent ' + A });
    expect(read.status).toBe('approved');                       // approval is untouched
    expect(read.periodYear).toBe(2025);                         // dated by its latest stage
    expect(read.edits.some((e) => e.actorName.includes('automatic'))).toBe(true);
  });

  it('moves to Granted with the patent number when the grant is published', async () => {
    await db.insert(patentGrants).values({
      patentNo: GRANT_NO, applicationNo: A, title: 'GRANTED TITLE', patentee: 'BIT', filedDate: '2024-06-01',
      publishedDate: '2025-01-10', office: 'KOLKATA', grantPublishedDate: '2026-02-06', issue: '06/2026',
    });
    expect((await refreshPatentRecords()).moved).toBe(1);
    const read = await getRecord(faculty, 'patents', id);
    expect(read.data).toMatchObject({ status: 'Granted', patentNumber: GRANT_NO, grantDate: '2026-02-06', statusDate: '2026-02-06' });
  });

  it('is idempotent: a second run changes nothing', async () => {
    expect((await refreshPatentRecords()).moved).toBe(0);
  });

  it('lists the move for its owner', async () => {
    const lines = (await autoUpdatesFor(faculty)).map((u) => u.text);
    expect(lines.some((t) => t.includes(A) && t.includes('Granted') && t.includes(GRANT_NO))).toBe(true);
  });
});

describe('an owner’s own choice is respected', () => {
  it('does not overwrite a status the owner changed by hand', async () => {
    await db.insert(patentApplications).values({
      applicationNo: B, title: 'B TITLE', filedDate: '2024-03-03', publishedDate: '2024-09-09',
      applicants: ['BIT Mesra'], inventors: [me()], issue: '36/2024',
    });
    // Fetched as Published, then the owner changed the status to Applied.
    const first = await applied(B, { status: 'Published', publishedDate: '2024-09-09', filedDate: '2024-03-03' });
    await updateRecord(faculty, 'patents', first.id, {
      applicationNo: B, inventors: faculty.name, applicant: 'BIT Mesra', country: 'India', title: 'Patent ' + B,
      status: 'Applied', filedDate: '2024-03-03', evidence: (await getRecord(faculty, 'patents', first.id)).data.evidence,
    }, 'submit');
    await db.insert(patentGrants).values({
      patentNo: GRANT_NO_B, applicationNo: B, title: 'B GRANTED', patentee: 'BIT', filedDate: '2024-03-03',
      publishedDate: '2024-09-09', office: 'KOLKATA', grantPublishedDate: '2026-03-06', issue: '10/2026',
    });
    expect((await refreshPatentRecords()).moved).toBe(0);
    expect((await getRecord(faculty, 'patents', first.id)).data.status).toBe('Applied');
  });
});
