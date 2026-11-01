import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { createRecord } from '@/server/records/service';
import { similarAwards } from '@/server/records/similarAwards';
import { normAwardName } from '@darp/shared/awards';
import type { SessionUser } from '@/server/auth/session';

/* Phase 3 of the decisions plan: the same award in two of the four award modules is pointed out, never refused. */

let faculty: SessionUser;
let colleague: SessionUser;
let hod: SessionUser;
const date = '2024-03-10';

beforeAll(async () => {
  await truncateAll();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  colleague = await makeUser({ role: 'faculty', dept: 'CSE' });
  hod = await makeUser({ role: 'hod', dept: 'CSE' });
});
afterAll(async () => { await closeDb(); });

describe('the same award elsewhere', () => {
  let first: { id: string };
  beforeAll(async () => {
    first = await createRecord(faculty, 'awards', { awardName: 'Best Teacher Award', awardDate: date }, 'draft');
  });

  it('is found in another award module, whatever the case and punctuation', async () => {
    const found = await similarAwards(faculty, { name: 'best  TEACHER award!', date });
    expect(found).toEqual([{ moduleKey: 'awards', moduleName: expect.any(String), recordId: first.id, name: 'Best Teacher Award' }]);
  });

  it('is found from each of the four modules’ own name fields', async () => {
    await createRecord(faculty, 'riawards', { awardName: 'Young Innovator & Research Prize', awardDate: date }, 'draft');
    await createRecord(faculty, 'extawards', { awardName: 'Community Service Medal', awardDate: date }, 'draft');
    await createRecord(faculty, 'fellowships', { name: 'Fulbright Fellowship', awardDate: date }, 'draft');
    for (const [name, moduleKey] of [
      ['young innovator and research prize', 'riawards'], ['Community Service Medal', 'extawards'], ['Fulbright fellowship', 'fellowships'],
    ] as const) {
      expect((await similarAwards(faculty, { name, date })).map((f) => f.moduleKey)).toEqual([moduleKey]);
    }
  });

  it('finds nothing for another date, a different name, or a name that is too short', async () => {
    expect(await similarAwards(faculty, { name: 'Best Teacher Award', date: '2024-03-11' })).toEqual([]);
    expect(await similarAwards(faculty, { name: 'Best Researcher Award', date })).toEqual([]);
    expect(await similarAwards(faculty, { name: 'Be', date })).toEqual([]);
    expect(await similarAwards(faculty, { name: 'Best Teacher Award', date: '2024-03' })).toEqual([]);
  });

  it('hides the record being edited, so it does not warn about itself', async () => {
    expect(await similarAwards(faculty, { name: 'Best Teacher Award', date, excludeId: first.id })).toEqual([]);
  });

  it('is never found by a colleague, nor by a head of department', async () => {
    expect(await similarAwards(colleague, { name: 'Best Teacher Award', date })).toEqual([]);
    expect(await similarAwards(hod, { name: 'Best Teacher Award', date })).toEqual([]);
  });

  it('does not stop the same award being saved again in another module', async () => {
    const again = await createRecord(faculty, 'extawards', { awardName: 'Best Teacher Award', awardDate: date }, 'draft');
    expect(again.id).toBeTruthy();
    expect((await similarAwards(faculty, { name: 'Best Teacher Award', date })).map((f) => f.moduleKey).sort()).toEqual(['awards', 'extawards']);
  });
});

describe('comparing names', () => {
  it('ignores case, accents, punctuation and spacing, and reads & as and', () => {
    expect(normAwardName('  Prix d’Excellence – Été  ')).toBe(normAwardName('prix d excellence ete'));
    expect(normAwardName('Science & Technology Award')).toBe(normAwardName('science and technology award'));
    expect(normAwardName('Award A')).not.toBe(normAwardName('Award B'));
  });
});
