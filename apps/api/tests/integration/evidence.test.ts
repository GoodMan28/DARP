import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { createRecord, getRecord } from '@/server/records/service';
import { uploadEvidence, getEvidenceForDownload } from '@/server/evidence/service';
import type { SessionUser } from '@/server/auth/session';

let owner: SessionUser;
let otherFaculty: SessionUser;
let drie: SessionUser;

/** The smallest bytes the content check accepts as a PDF. */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

let n = 0;
const patent = (evidence: string) => ({
  inventors: 'Test Inventor',
  applicant: 'Birla Institute of Technology, Mesra',
  country: 'India',
  applicationNo: `20233101${String(2000 + (n += 1)).padStart(4, '0')}`,
  title: 'A patented thing',
  status: 'Published',
  statusDate: '2023-05-01',
  evidence,
});

const upload = (actor: SessionUser) => uploadEvidence(actor, {
  bytes: PDF, fileName: 'certificate.pdf', declaredMime: 'application/pdf',
  fieldKey: 'evidence', moduleKey: 'patents',
});

beforeAll(async () => {
  await truncateAll();
  owner = await makeUser({ role: 'faculty', dept: 'CSE' });
  otherFaculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  drie = await makeUser({ role: 'drie' });
});
afterAll(async () => { await closeDb(); });

describe('evidence files', () => {
  it('attaches an uploaded file to the record it is saved with', async () => {
    const file = await upload(owner);
    const { id } = await createRecord(owner, 'patents', patent(file.id), 'submit');
    expect((await getRecord(owner, 'patents', id)).data.evidence).toBe(file.id);
  });

  it('lets the verifying office download it once attached', async () => {
    const file = await upload(owner);
    await createRecord(owner, 'patents', patent(file.id), 'submit');
    const got = await getEvidenceForDownload(drie, file.id);
    expect(got.originalName).toBe('certificate.pdf');
    expect(got.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('hides it from someone who cannot read the record', async () => {
    const file = await upload(owner);
    await createRecord(owner, 'patents', patent(file.id), 'submit');
    await expect(getEvidenceForDownload(otherFaculty, file.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a record that points at somebody else\'s file', async () => {
    const theirs = await upload(owner);
    await expect(createRecord(otherFaculty, 'patents', patent(theirs.id), 'draft'))
      .rejects.toMatchObject({ code: 'VALIDATION', fields: { evidence: 'Upload the file again.' } });
  });

  it('refuses a file already attached to another record', async () => {
    const file = await upload(owner);
    await createRecord(owner, 'patents', patent(file.id), 'draft');
    await expect(createRecord(owner, 'patents', patent(file.id), 'draft'))
      .rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('refuses a file uploaded for a different field', async () => {
    const offer = await uploadEvidence(owner, {
      bytes: PDF, fileName: 'offer.pdf', declaredMime: 'application/pdf', fieldKey: 'offerLetter', moduleKey: 'studentsguided',
    });
    await expect(createRecord(owner, 'patents', patent(offer.id), 'draft'))
      .rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('still refuses a file that is not really a PDF', async () => {
    await expect(uploadEvidence(owner, {
      bytes: Buffer.from('<html>not a pdf</html>'), fileName: 'evil.pdf', declaredMime: 'application/pdf',
      fieldKey: 'evidence', moduleKey: 'patents',
    })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
