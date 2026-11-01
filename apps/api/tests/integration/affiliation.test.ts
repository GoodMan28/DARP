import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadBitLists } from '../helpers/lists';
import { loadTestInstitutes } from '../helpers/institutes';
import { createRecord, getRecord, updateRecord } from '@/server/records/service';
import { validateRecord } from '@/server/records/validate';
import { MODULES } from '@darp/shared/modules';
import type { SessionUser } from '@/server/auth/session';

/* Phase 7 of the decisions plan: every faculty module says whether the work was done while the person was at BIT. */

let faculty: SessionUser;        // joined 1 July 2015
let newcomer: SessionUser;       // no joining date on the account
let iqac: SessionUser;           // joined long before: if IQAC's own date were used, everything would be Yes

const award = (over: Record<string, unknown> = {}) => ({
  awardName: 'Best Teacher', awardDate: '2019-03-05', level: 'National', agency: 'x', agencyCode: 'ROR-07serb001', validityYears: '3', ...over,
});
const answerOf = async (actor: SessionUser, moduleKey: string, id: string, field = 'affiliatedToBit') => (await getRecord(actor, moduleKey, id)).data[field];

beforeAll(async () => {
  await truncateAll();
  await loadBitLists();
  await loadTestInstitutes();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  newcomer = await makeUser({ role: 'faculty', dept: 'CSE' });
  iqac = await makeUser({ role: 'admin', joined: '1990-01-01' });
  const { db } = await import('../helpers/db');
  const { users } = await import('@/server/db/schema');
  const { eq } = await import('drizzle-orm');
  await db.update(users).set({ dateOfJoining: null }).where(eq(users.id, newcomer.id));
});
afterAll(async () => { await closeDb(); });

describe('filled in from the joining date', () => {
  it('says Yes for work after joining and No for work before, and keeps it', async () => {
    const after = await createRecord(faculty, 'awards', award(), 'submit');
    const before = await createRecord(faculty, 'awards', award({ awardName: 'Old prize', awardDate: '2010-01-01' }), 'submit');
    expect(await answerOf(faculty, 'awards', after.id)).toBe('Yes');
    expect(await answerOf(faculty, 'awards', before.id)).toBe('No');
  });

  it('works for each module that has a date', async () => {
    const fdp = await createRecord(faculty, 'fdpattended', {
      programType: 'Short Term Course', organisingInstitution: 'x', organisingInstitutionCode: 'U-0050', startDate: '2012-02-01', endDate: '2012-02-03',
    }, 'submit');
    expect(await answerOf(faculty, 'fdpattended', fdp.id)).toBe('No');
    const econtent = await createRecord(faculty, 'econtent', {
      moduleName: 'Signals', platform: 'SWAYAM', launchDate: '2020-05-05', moduleLink: 'https://example.com/signals',
    }, 'submit');
    expect(await answerOf(faculty, 'econtent', econtent.id)).toBe('Yes');
  });

  it('never changes an answer the person gave, even when the date says otherwise', async () => {
    const rec = await createRecord(faculty, 'awards', award({ awardName: 'Joint prize', awardDate: '2019-04-01', affiliatedToBit: 'No' }), 'submit');
    expect(await answerOf(faculty, 'awards', rec.id)).toBe('No');
    const view = await getRecord(faculty, 'awards', rec.id);
    await updateRecord(faculty, 'awards', rec.id, { ...view.editValues, awardName: 'Joint prize (renamed)' }, 'submit');
    expect(await answerOf(faculty, 'awards', rec.id)).toBe('No');
  });

  it('uses the record owner’s joining date when IQAC edits, not IQAC’s own', async () => {
    const draft = await createRecord(faculty, 'awards', { awardName: 'Undated prize' }, 'draft');
    expect(await answerOf(faculty, 'awards', draft.id)).toBeUndefined();
    const view = await getRecord(iqac, 'awards', draft.id);
    await updateRecord(iqac, 'awards', draft.id, { ...view.editValues, awardDate: '2010-01-01' }, 'draft');
    expect(await answerOf(faculty, 'awards', draft.id)).toBe('No');       // before the owner joined in 2015, though after IQAC did in 1990
  });

  it('is asked, and refused on submission, when the account has no joining date', async () => {
    const draft = await createRecord(newcomer, 'awards', award({ awardName: 'No date on file' }), 'draft');
    expect(await answerOf(newcomer, 'awards', draft.id)).toBeUndefined();
    await expect(createRecord(newcomer, 'awards', award({ awardName: 'No date on file 2' }), 'submit'))
      .rejects.toMatchObject({ fields: { affiliatedToBit: expect.any(String) } });
    expect(await answerOf(newcomer, 'awards', (await createRecord(newcomer, 'awards', award({ awardName: 'Answered by hand', affiliatedToBit: 'Yes' }), 'submit')).id)).toBe('Yes');
  });
});

describe('asked where the work has no date', () => {
  const engagement = (over: Record<string, unknown> = {}) => ({
    recordType: 'Consultancy', consultants: 'A. K. Verma', projectTitle: 'History 1', agency: 'Tata Steel', financialYear: '2024', revenue: '50000', ...over,
  });

  it('saves a draft without it, and refuses a submission without it', async () => {
    const draft = await createRecord(faculty, 'consultancy', engagement(), 'draft');
    expect(await answerOf(faculty, 'consultancy', draft.id)).toBeUndefined();
    await expect(createRecord(faculty, 'consultancy', engagement({ projectTitle: 'History 2' }), 'submit'))
      .rejects.toMatchObject({ fields: { affiliatedToBit: expect.any(String) } });
    const ok = await createRecord(faculty, 'consultancy', engagement({ projectTitle: 'History 3', affiliatedToBit: 'Yes' }), 'submit');
    expect(await answerOf(faculty, 'consultancy', ok.id)).toBe('Yes');
  });

  it('is filled in for an outreach activity with a date, and asked for one with only a year', async () => {
    const activity = (over: Record<string, unknown> = {}) => ({
      activityType: 'Invited talk', eventName: 'Seminar', talkTitle: 'Talk', organisation: 'IIT Delhi', where: 'Outside BIT', ...over,
    });
    const dated = await createRecord(faculty, 'outreach', activity({ date: '2021-06-01' }), 'submit');
    expect(await answerOf(faculty, 'outreach', dated.id)).toBe('Yes');
    await expect(createRecord(faculty, 'outreach', activity({ year: '2021' }), 'submit')).rejects.toMatchObject({ fields: { affiliatedToBit: expect.any(String) } });
  });
});

describe('papers and books', () => {
  const account = { name: 'Dr X', dateOfJoining: '2015-07-01' };
  const paper = (over: Record<string, unknown> = {}) => ({ doi: '10.1/abc', title: 'T', year: '2016', ...over });

  it('are answered from the date the work first appeared: before joining is No, after is Yes', async () => {
    const no = await validateRecord(MODULES.publications!, paper({ publishedOn: '2014-06' }), 'draft', { account });
    expect(no.data.affiliatedToBit).toBe('No');
    const yes = await validateRecord(MODULES.publications!, paper({ publishedOn: '2018-02-01' }), 'draft', { account });
    expect(yes.data.affiliatedToBit).toBe('Yes');
    const book = await validateRecord(MODULES.books!, { publishedOn: '2013' }, 'draft', { account });
    expect(book.data.sameAffiliation).toBe('No');
  });

  it('are asked when only the year of joining is known', async () => {
    const same = await validateRecord(MODULES.publications!, paper({ publishedOn: '2015' }), 'submit', { account });
    expect(same.errors.affiliatedToBit).toMatch(/at BIT/);
  });

  it('are asked when the account has no joining date', async () => {
    const r = await validateRecord(MODULES.publications!, paper({ publishedOn: '2018-02-01' }), 'submit', { account: { name: 'x', dateOfJoining: null } });
    expect(r.errors.affiliatedToBit).toMatch(/at BIT/);
  });

  it('keep the answer given, and keep the date for later', async () => {
    const r = await validateRecord(MODULES.publications!, paper({ publishedOn: '2018-02-01', affiliatedToBit: 'No' }), 'draft', { account });
    expect(r.data).toMatchObject({ affiliatedToBit: 'No', publishedOn: '2018-02-01' });
  });

  it('have no date field on the form', () => {
    expect(MODULES.publications!.fields.find((f) => f.key === 'publishedOn')).toMatchObject({ hidden: true });
    expect(MODULES.books!.fields.find((f) => f.key === 'publishedOn')).toMatchObject({ hidden: true });
  });
});

describe('what IQAC’s files ask', () => {
  it('is unchanged: the new answer adds no column to a format, and the two old ones keep their headings', () => {
    for (const m of Object.values(MODULES)) {
      if (!m.affiliation || ['publications', 'books'].includes(m.key)) continue;
      expect(m.fields.find((f) => f.key === 'affiliatedToBit')!.exportAs).toBeUndefined();
    }
    expect(MODULES.publications!.fields.find((f) => f.key === 'affiliatedToBit')!.exportAs!.drie).toBe('Affiliated to BIT at the time of publication (Yes/No)');
    expect(MODULES.books!.fields.find((f) => f.key === 'sameAffiliation')!.exportAs!.drie).toBe('Whether at the time of publication Affiliating Institution  was same Yes/No');
  });
});
