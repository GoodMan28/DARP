import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadBitLists } from '../helpers/lists';
import { loadTestInstitutes } from '../helpers/institutes';
import { proposeInstitute } from '@/server/institutions/propose';
import { createRecord, getRecord } from '@/server/records/service';
import { counterValuesFor } from '@/server/rollups/completion';
import { readReportRequest, generateReport } from '@/server/export/reports';
import { OUTREACH_TYPES as T, MODULES } from '@darp/shared/modules';
import type { SessionUser } from '@/server/auth/session';

/* Outreach Activities: one form whose fields follow the kind of activity chosen. */

let faculty: SessionUser;
let colleague: SessionUser;

const base = { organisation: 'x', organisationCode: 'U-0050', year: '2025', affiliatedToBit: 'Yes' };

beforeAll(async () => {
  await truncateAll();
  await loadBitLists();
  await loadTestInstitutes();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  colleague = await makeUser({ role: 'faculty', dept: 'CSE' });
});
afterAll(async () => { await closeDb(); });

describe('one form, eight kinds', () => {
  it('asks each kind for its own fields', async () => {
    await expect(createRecord(faculty, 'outreach', { ...base, activityType: T.review }, 'submit'))
      .rejects.toMatchObject({ fields: { journalName: expect.any(String), papersReviewed: expect.any(String) } });
    await expect(createRecord(faculty, 'outreach', { ...base, activityType: T.body }, 'submit'))
      .rejects.toMatchObject({ fields: { bodyKind: expect.any(String), bodyName: expect.any(String) } });
    await expect(createRecord(faculty, 'outreach', { ...base, activityType: T.talk, eventName: 'ICACCI 2025' }, 'submit'))
      .rejects.toMatchObject({ fields: { talkTitle: expect.any(String) } });
    await expect(createRecord(faculty, 'outreach', { ...base, activityType: T.other, eventName: 'Hackathon' }, 'submit'))
      .rejects.toMatchObject({ fields: { otherType: expect.any(String) } });
  });

  it('keeps only the fields of the kind chosen', async () => {
    const { id } = await createRecord(faculty, 'outreach', {
      ...base, activityType: T.review, journalName: 'IEEE Access', publisher: 'IEEE', papersReviewed: '6',
      talkTitle: 'Left over from another kind', eventName: 'Not asked for a review',
    }, 'submit');
    const r = await getRecord(faculty, 'outreach', id);
    expect(r.status).toBe('approved');
    expect(r.data).toMatchObject({ journalName: 'IEEE Access', papersReviewed: 6 });
    expect(r.data.talkTitle).toBeUndefined();
    expect(r.data.eventName).toBeUndefined();
  });

  it('lets two colleagues record the same event', async () => {
    const talk = { ...base, activityType: T.chair, eventName: 'ICACCI 2025', chairRole: 'Chair' };
    await createRecord(faculty, 'outreach', talk, 'submit');
    await expect(createRecord(colleague, 'outreach', { ...talk, chairRole: 'Co-chair' }, 'submit')).resolves.toMatchObject({ status: 'approved' });
  });

  it('counts the activities, all of them outside BIT, and has no separate outside count', async () => {
    const v = await counterValuesFor(faculty, faculty.id, { from: 2025, to: 2025 });
    const value = (k: string) => v.computed.find((c) => c.key === k)?.value;
    expect(value('outreach.count.cycle')).toBe(2);                          // the review and the session chair
    expect(v.computed.some((c) => c.key.startsWith('outreach.count.outside'))).toBe(false);
  });

  it('asks for an institute outside BIT, from the directory, and refuses BIT Mesra', async () => {
    const talk = { ...base, activityType: T.viva, eventName: 'PhD viva', examinerRole: 'Internal examiner' };
    await expect(createRecord(faculty, 'outreach', { ...talk, organisationCode: 'U-0202' }, 'submit'))
      .rejects.toMatchObject({ fields: { organisation: 'Choose an institute outside BIT.' } });
    const ok = await createRecord(faculty, 'outreach', { ...talk, organisationCode: 'U-0391' }, 'submit');
    expect((await getRecord(faculty, 'outreach', ok.id)).data).toMatchObject({ organisationCode: 'U-0391' });
    await expect(createRecord(faculty, 'outreach', { ...talk, organisationCode: '', organisation: '' }, 'submit'))
      .rejects.toMatchObject({ fields: { organisation: expect.any(String) } });
  });

  it('asks a journal review for no organisation: the journal and publisher are the place', async () => {
    const rec = await createRecord(faculty, 'outreach', {
      year: '2025', affiliatedToBit: 'Yes', activityType: T.review, journalName: 'Pattern Recognition', papersReviewed: '2',
    }, 'submit');
    expect((await getRecord(faculty, 'outreach', rec.id)).data.organisation).toBeUndefined();
  });

  it('takes a company the directory lacked, added on the spot', async () => {
    const hit = await proposeInstitute(faculty, { name: 'Eastern Alloys Pvt Ltd', kind: 'Company', country: 'India' });
    const rec = await createRecord(faculty, 'outreach', { ...base, organisationCode: hit.code, activityType: T.industry, eventName: 'Plant visit', purpose: 'Plant visit' }, 'submit');
    expect((await getRecord(faculty, 'outreach', rec.id)).data).toMatchObject({ organisationCode: hit.code, organisation: 'Eastern Alloys Pvt Ltd, India' });
  });

  it('keeps no "Where" question any more', () => {
    expect(MODULES.outreach!.fields.some((f) => f.key === 'where')).toBe(false);
    expect(MODULES.outreach!.listColumns).not.toContain('where');
  });

  it('adds an Outreach sheet to the Faculty format', async () => {
    const q = readReportRequest(faculty, 'naac', new URLSearchParams({ workbook: 'faculty', from: '2025', to: '2025' }));
    const { workbook } = await generateReport(faculty, q, []);
    const sheet = workbook.getWorksheet('Outreach')!;
    expect(sheet).toBeTruthy();
    let text = '';
    sheet.eachRow((row) => row.eachCell((c) => { text += ` ${c.text}`; }));
    expect(text).toContain('Name of the teacher');
    expect(text).toContain('IEEE Access');
    expect(text).toContain('Journal paper review');
  });
});
