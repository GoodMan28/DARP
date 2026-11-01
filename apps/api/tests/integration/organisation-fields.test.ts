import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadBitLists } from '../helpers/lists';
import { loadTestInstitutes } from '../helpers/institutes';
import { validateRecord } from '@/server/records/validate';
import { createRecord, getRecord } from '@/server/records/service';
import { proposeInstitute } from '@/server/institutions/propose';
import { buildPlans } from '@/server/export/mapping';
import { MODULES } from '@darp/shared/modules';
import type { SessionUser } from '@/server/auth/session';

/* Phase 5 of the decisions plan: awarding bodies, funding agencies and employers are chosen, not typed. */

const BODIES: Array<[moduleKey: string, key: string]> = [
  ['awards', 'agency'], ['riawards', 'awardingBody'], ['extawards', 'awardingBody'],
  ['fellowships', 'agency'], ['grants', 'agency'], ['studentsguided', 'employerName'],
];
let faculty: SessionUser;

beforeAll(async () => {
  await truncateAll();
  await loadBitLists();
  await loadTestInstitutes();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
});
afterAll(async () => { await closeDb(); });

describe.each(BODIES)('%s.%s', (moduleKey, key) => {
  const m = MODULES[moduleKey]!;
  // The employer box only shows for a student who is employed; the rest are always there.
  const when = moduleKey === 'studentsguided' ? { statusAfterPassing: 'Employed' } : {};
  const draft = (over: Record<string, unknown>) => validateRecord(m, { ...when, ...over }, 'draft');

  it('is an institute box, with its ID kept beside it', () => {
    expect(m.fields.find((f) => f.key === key)!.type).toBe('institution');
    expect(m.fields.find((f) => f.key === `${key}Code`)!.type).toBe('institutionCode');
  });

  it('is written from the directory, whatever name the browser sent', async () => {
    const r = await draft({ [key]: 'anything typed', [`${key}Code`]: 'ROR-07serb001' });
    expect(r.errors[key]).toBeUndefined();
    expect(r.data[key]).toBe('Science and Engineering Research Board, India');
    expect(r.data[`${key}Code`]).toBe('ROR-07serb001');
  });

  it('refuses a code the directory does not know', async () => {
    expect((await draft({ [key]: 'x', [`${key}Code`]: 'ROR-0nothere0' })).errors[key]).toBe('Choose the institute from the list again.');
  });

  it('keeps a name typed before the directory existed, in a draft, and asks for a choice on submit', async () => {
    expect((await draft({ [key]: 'DST' })).errors[key]).toBeUndefined();
    const submit = await validateRecord(m, { ...when, [key]: 'DST' }, 'submit');
    expect(submit.errors[key]).toBe('Choose this institute from the list, or add it.');
  });

  it('adds no column to IQAC’s formats', () => {
    expect(m.fields.find((f) => f.key === `${key}Code`)!.exportAs).toBeUndefined();
    const own = buildPlans().filter((p) => p.moduleKey === moduleKey).flatMap((p) => p.columns.filter((c) => c.fieldKey === `${key}Code`));
    expect(own).toEqual([]);
  });
});

describe('a company or funder added by the person', () => {
  it('can be the employer of a student, and its name is kept', async () => {
    const hit = await proposeInstitute(faculty, { name: 'Eastern Forge Pvt Ltd', kind: 'Company', country: 'India', city: 'Jamshedpur' });
    const rec = await createRecord(faculty, 'studentsguided', {
      studentName: 'Asha Rao', rollNo: 'BTECH/1/18', program: 'B.Tech.', specialisation: 'Civil Engineering', yearOfPassing: '2022',
      statusAfterPassing: 'Employed', employerName: 'x', employerNameCode: hit.code, payPackage: '600000',
    }, 'draft');
    expect((await getRecord(faculty, 'studentsguided', rec.id)).data).toMatchObject({ employerName: 'Eastern Forge Pvt Ltd, India', employerNameCode: hit.code });
  });

  it('is told apart from another funder in the duplicate check of a grant', () => {
    expect(MODULES.grants!.naturalKey).toEqual(['title', 'agencyCode', 'sanctionDate']);
  });
});

describe('what stays text', () => {
  it('is the consultancy agency, which asks for contact details as well', () => {
    expect(MODULES.consultancy!.fields.find((f) => f.key === 'agency')!.type).toBe('textarea');
  });
});
