import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadBitLists } from '../helpers/lists';
import { loadTestInstitutes } from '../helpers/institutes';
import { records } from '@/server/db/schema';
import { createRecord, getRecord, updateRecord } from '@/server/records/service';
import { readReportRequest, summariseReport, generateReport } from '@/server/export/reports';
import { countLeftOut } from '@/server/export/excel';
import { buildPlans } from '@/server/export/mapping';
import { counterValuesFor, papersForUsers } from '@/server/rollups/completion';
import { declaredSheet } from '@/server/rollups/declared';
import type { SessionUser } from '@/server/auth/session';

/* Phase 8 of the decisions plan: reports and counts hold the work done at BIT; the rest stays with its owner. */

let faculty: SessionUser;
let other: SessionUser;            // another department
let hod: SessionUser;
let admin: SessionUser;
const ids: Record<string, string> = {};
const q = (params: Record<string, string>) => new URLSearchParams(params);
const award = (name: string, over: Record<string, unknown> = {}) => ({
  awardName: name, awardDate: '2023-03-05', level: 'National', agency: 'x', agencyCode: 'ROR-07serb001', validityYears: '3', ...over,
});
const sheetRows = async (actor: SessionUser, moduleKey: string, params = { from: '2023', to: '2023' }) => {
  const s = await summariseReport(actor, readReportRequest(actor, 'full', q(params)));
  return s.sheets.find((x) => x.moduleKey === moduleKey)?.rows ?? 0;
};
const sinceJoining = async (actor: SessionUser, key: string) => (await counterValuesFor(actor, actor.id)).computed.find((c) => c.key === key)!.value;

beforeAll(async () => {
  await truncateAll();
  await loadBitLists();
  await loadTestInstitutes();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  other = await makeUser({ role: 'faculty', dept: 'ME' });
  hod = await makeUser({ role: 'hod', dept: 'CSE' });
  admin = await makeUser({ role: 'admin' });
  ids.yes = (await createRecord(faculty, 'awards', award('Done at BIT'), 'submit')).id;
  ids.no = (await createRecord(faculty, 'awards', award('Done elsewhere', { affiliatedToBit: 'No' }), 'submit')).id;
  ids.blank = (await createRecord(faculty, 'awards', award('Saved before the question'), 'submit')).id;
  await db.update(records).set({ data: sql`${records.data} - 'affiliatedToBit'` }).where(eq(records.id, ids.blank!));     // an old record: no answer
  await createRecord(other, 'awards', award('Other department, elsewhere', { affiliatedToBit: 'No' }), 'submit');
  await createRecord(other, 'fellowships', {
    supportType: 'National fellowship', name: 'A fellowship', amount: '50000', purpose: 'Research', stature: 'National',
    agency: 'DST', agencyCode: 'ROR-07serb001', awardDate: '2023-04-01', validityYears: '2',
  }, 'submit');
});
afterAll(async () => { await closeDb(); });

describe('reports', () => {
  it('leave out work marked as not done at BIT, keep work with no answer, and agree with the preview', async () => {
    expect(await sheetRows(admin, 'awards')).toBe(2 + 0);          // Done at BIT, and the old record with no answer
    const report = await generateReport(admin, readReportRequest(admin, 'full', q({ from: '2023', to: '2023' })), []);
    expect(report.sheetsWritten).toBeGreaterThan(0);
    const names: string[] = [];
    report.workbook.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => names.push(c.text))));
    expect(names).toContain('Done at BIT');
    expect(names).toContain('Saved before the question');
    expect(names).not.toContain('Done elsewhere');
  });

  it('say how many were left out, on the About sheet', async () => {
    const report = await generateReport(admin, readReportRequest(admin, 'full', q({ from: '2023', to: '2023' })), []);
    const lines: string[] = [];
    report.workbook.getWorksheet('About this report')!.eachRow((row) => lines.push(row.values ? (row.values as unknown[]).join(' ') : ''));
    expect(lines.some((l) => /Work before BIT.*2 records left out/.test(l))).toBe(true);     // one of the faculty's, one of the other department's
  });

  it('count only the caller’s own scope when saying so', async () => {
    const awards = buildPlans().filter((p) => p.moduleKey === 'awards');
    const opts = { includePii: false, range: { from: 2023, to: 2023 } };
    expect(await countLeftOut(awards, { ...opts, actor: hod })).toBe(1);        // the head of CSE sees CSE's only
    expect(await countLeftOut(awards, { ...opts, actor: admin })).toBe(2);
  });

  it('are not changed for a module that does not ask the question', async () => {
    expect(await sheetRows(admin, 'fellowships')).toBe(1);
  });

  it('bring the work back when its owner changes the answer to Yes', async () => {
    const view = await getRecord(faculty, 'awards', ids.no!);
    await updateRecord(faculty, 'awards', ids.no!, { ...view.editValues, affiliatedToBit: 'Yes' }, 'submit');
    expect(await sheetRows(admin, 'awards')).toBe(3);
    await updateRecord(faculty, 'awards', ids.no!, { ...view.editValues, affiliatedToBit: 'No' }, 'submit');
    expect(await sheetRows(admin, 'awards')).toBe(2);
  });

  it('leave the work in its owner’s own list', async () => {
    const view = await getRecord(faculty, 'awards', ids.no!);
    expect(view.data.awardName).toBe('Done elsewhere');
    expect(view.canEdit).toBe(true);
  });
});

describe('counts', () => {
  it('do not include work marked as not done at BIT', async () => {
    expect(await sinceJoining(faculty, 'awards.count.sinceJoining')).toBe(2);       // done at BIT + no answer; not "done elsewhere"
    expect(await sinceJoining(other, 'awards.count.sinceJoining')).toBe(0);
    expect(await sinceJoining(other, 'fellowships.count.sinceJoining')).toBe(1);    // a module without the question counts as before
  });

  it('leave it out of the counted figure beside a declared one, too', async () => {
    const owner = await makeUser({ role: 'faculty', dept: 'CSE', joined: '2010-01-01' });
    const fdp = (inst: string, start: string, over: Record<string, unknown> = {}) => ({
      programType: 'Short Term Course', organisingInstitution: 'x', organisingInstitutionCode: inst, startDate: start, endDate: start, ...over,
    });
    await createRecord(owner, 'fdpattended', fdp('U-0050', '2024-09-02'), 'submit');
    await createRecord(owner, 'fdpattended', fdp('U-0391', '2024-10-02', { affiliatedToBit: 'No' }), 'submit');
    const sheet = await declaredSheet(owner, { counted: true }, new Date('2026-10-30'));
    expect(sheet.rows.find((r) => r.key === 'manual.workshops.attended.sinceJoining')!.counted!.value).toBe(1);
  });

  it('are the same for the research-quality signal', async () => {
    const papers = await papersForUsers([faculty.id], { from: 2020, to: 2026 });
    expect(papers.get(faculty.id)!.papers).toBe(0);                                  // no papers in this test: nothing is invented
  });
});
