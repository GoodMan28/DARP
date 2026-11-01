import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { createRecord, getRecord } from '@/server/records/service';
import { counterValuesFor } from '@/server/rollups/completion';
import { readReportRequest, generateReport } from '@/server/export/reports';
import { OUTREACH_TYPES as T } from '@darp/shared/modules';
import type { SessionUser } from '@/server/auth/session';

/* Outreach Activities: one form whose fields follow the kind of activity chosen. */

let faculty: SessionUser;
let colleague: SessionUser;

const base = { organisation: 'IIT Kharagpur', where: 'Outside BIT', year: '2025', affiliatedToBit: 'Yes' };

beforeAll(async () => {
  await truncateAll();
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

  it('counts all activities and those outside BIT', async () => {
    await createRecord(faculty, 'outreach', {
      ...base, where: 'At BIT', organisation: 'BIT Mesra', activityType: T.viva, eventName: 'PhD viva', examinerRole: 'Internal examiner',
    }, 'submit');
    const v = await counterValuesFor(faculty, faculty.id, { from: 2025, to: 2025 });
    const value = (k: string) => v.computed.find((c) => c.key === k)?.value;
    expect(value('outreach.count.cycle')).toBe(3);
    expect(value('outreach.count.outside.cycle')).toBe(2);
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
