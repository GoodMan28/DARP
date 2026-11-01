import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadBitLists } from '../helpers/lists';
import { loadTestInstitutes } from '../helpers/institutes';
import { records } from '@/server/db/schema';
import { createRecord, getRecord } from '@/server/records/service';
import { proposeInstitute } from '@/server/institutions/propose';
import { matchOldInstitutes, matchText } from '@/server/records/institutionMatch';
import type { SessionUser } from '@/server/auth/session';

/* Phase 8 of the institutes plan: names typed before the directory existed get their entry, only when it is certain. */

let faculty: SessionUser;
let iqac: SessionUser;
const ids: Record<string, string> = {};

const contact = (institution: string, over: Record<string, unknown> = {}) => ({
  title: 'Dr.', firstName: 'Ravi', lastName: 'Menon', designation: 'Professor', department: 'Physics', institution,
  email: `ravi${Math.random().toString(36).slice(2, 8)}@example.com`, specialisation: 'Optics', consentStatus: 'Not yet contacted', ...over,
});
const readData = async (id: string) => (await getRecord(faculty, 'qscontacts', id)).data;

beforeAll(async () => {
  await truncateAll();
  await loadBitLists();
  await loadTestInstitutes();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  iqac = await makeUser({ role: 'admin' });
  // Two organisations with one name in two countries: a typed "Twin Works" cannot be told apart.
  await proposeInstitute(iqac, { name: 'Twin Works', kind: 'Company', country: 'India' });
  await proposeInstitute(iqac, { name: 'Twin Works', kind: 'Company', country: 'Germany' });
  // Drafts, so a name typed in the old way is kept as it was.
  ids.exact = (await createRecord(faculty, 'qscontacts', contact('Indian Institute of Technology Kharagpur'), 'draft')).id;
  ids.short = (await createRecord(faculty, 'qscontacts', contact('IIT Kharagpur'), 'draft')).id;
  ids.comma = (await createRecord(faculty, 'qscontacts', contact('Indian Institute of Technology Kharagpur, Kharagpur, India'), 'draft')).id;
  ids.twin = (await createRecord(faculty, 'qscontacts', contact('Twin Works'), 'draft')).id;
  ids.unknown = (await createRecord(faculty, 'qscontacts', contact('Hogwarts School'), 'draft')).id;
  ids.chosen = (await createRecord(faculty, 'qscontacts', contact('x', { institutionCode: 'U-0391' }), 'draft')).id;
});
afterAll(async () => { await closeDb(); });

describe('reading one typed text', () => {
  const byName = new Map([['iit delhi', ['U-1']], ['government college', ['C-1', 'C-2']], ['indian institute of technology kharagpur', ['U-0050']]]);
  it('matches the whole text, or the text with its place and country dropped', () => {
    expect(matchText('IIT Delhi', byName)).toEqual({ state: 'matched', codes: ['U-1'] });
    expect(matchText('iit  delhi, Delhi, India', byName)).toEqual({ state: 'matched', codes: ['U-1'] });
    expect(matchText('Indian Institute of Technology, Kharagpur', byName)).toEqual({ state: 'matched', codes: ['U-0050'] });   // punctuation is not a different name
    expect(matchText('Indian Institute of Technology Delhi', byName)).toEqual({ state: 'none', codes: [] });                // a different name, not a guess
  });
  it('says so when several entries have the name, and never tries a shorter text after that', () => {
    expect(matchText('Government College, Ranchi', byName)).toEqual({ state: 'ambiguous', codes: ['C-1', 'C-2'] });
    expect(matchText('Government', byName)).toEqual({ state: 'none', codes: [] });
  });
  it('finds nothing for a text that names no entry', () => {
    expect(matchText('Hogwarts School', byName)).toEqual({ state: 'none', codes: [] });
    expect(matchText('', byName)).toEqual({ state: 'none', codes: [] });
  });
});

describe('the dry run', () => {
  it('reports what it would match, per text, and changes nothing', async () => {
    const report = await matchOldInstitutes(iqac, { apply: false });
    const line = (text: string) => report.lines.find((l) => l.moduleKey === 'qscontacts' && l.text === text)!;
    expect(line('Indian Institute of Technology Kharagpur')).toMatchObject({ state: 'matched', codes: ['U-0050'], records: 1 });
    expect(line('IIT Kharagpur')).toMatchObject({ state: 'matched', codes: ['U-0050'] });
    expect(line('Indian Institute of Technology Kharagpur, Kharagpur, India')).toMatchObject({ state: 'matched', codes: ['U-0050'] });
    expect(line('Twin Works')).toMatchObject({ state: 'ambiguous' });
    expect(line('Twin Works').codes).toHaveLength(2);
    expect(line('Hogwarts School')).toMatchObject({ state: 'none', codes: [] });
    expect(report.applied).toBe(0);
    expect((await readData(ids.exact!)).institutionCode).toBeFalsy();
    expect((await readData(ids.short!)).institution).toBe('IIT Kharagpur');
  });

  it('leaves out an institute that was already chosen from the directory', async () => {
    const report = await matchOldInstitutes(iqac, { apply: false });
    expect(report.lines.some((l) => l.text === 'x')).toBe(false);
  });
});

describe('applying it', () => {
  it('gives each certain match its entry and the text the directory writes it as', async () => {
    const report = await matchOldInstitutes(iqac, { apply: true });
    expect(report.applied).toBe(3);
    for (const key of ['exact', 'short', 'comma'] as const) {
      expect(await readData(ids[key]!)).toMatchObject({ institutionCode: 'U-0050', institution: 'Indian Institute of Technology, Kharagpur, West Bengal, India' });
    }
  });

  it('leaves an ambiguous or unknown name, and a chosen one, exactly as they were', async () => {
    expect(await readData(ids.twin!)).toMatchObject({ institution: 'Twin Works' });
    expect((await readData(ids.twin!)).institutionCode).toBeFalsy();
    expect((await readData(ids.unknown!)).institution).toBe('Hogwarts School');
    expect((await readData(ids.chosen!)).institutionCode).toBe('U-0391');
  });

  it('keeps the record’s status and the search text follows the new name', async () => {
    const [row] = await db.select({ status: records.status, search: records.searchText }).from(records).where(eq(records.id, ids.short!));
    expect(row!.status).toBe('draft');
    expect(row!.search).toContain('kharagpur');
  });

  it('finds nothing more to do when run again', async () => {
    const again = await matchOldInstitutes(iqac, { apply: true });
    expect(again.applied).toBe(0);
    expect(again.lines.filter((l) => l.state === 'matched')).toHaveLength(0);
  });

  it('is for IQAC only', async () => {
    await expect(matchOldInstitutes(faculty, { apply: false })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
