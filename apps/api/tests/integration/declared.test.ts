import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadBitLists } from '../helpers/lists';
import { loadTestInstitutes } from '../helpers/institutes';
import { createRecord } from '@/server/records/service';
import { declaredSheet, saveDeclared } from '@/server/rollups/declared';
import { figuresForUsers } from '@/server/rollups/completion';
import { lastCompletedYear } from '@/server/rollups/counters';
import type { SessionUser } from '@/server/auth/session';

/* Phase 6 of the decisions plan: declared figures are kept for the year they are about, and can be compared with the count. */

const TODAY = new Date('2026-10-30');           // AY 2025-26 and CY 2025 are the last that have ended
let me: SessionUser;
let colleague: SessionUser;
const SEMINARS_AY = 'manual.seminars.national.cycle';
const PAPERS_CY = 'manual.papersPresented.national.cycle';
const since = 'manual.seminars.national.sinceJoining';
const row = (sheet: Awaited<ReturnType<typeof declaredSheet>>, key: string) => sheet.rows.find((r) => r.key === key)!;

beforeAll(async () => {
  await truncateAll();
  await loadBitLists();
  await loadTestInstitutes();
  me = await makeUser({ role: 'faculty', dept: 'CSE', joined: '2018-08-01' });
  colleague = await makeUser({ role: 'faculty', dept: 'CSE' });
});
afterAll(async () => { await closeDb(); });

describe('the last year that has ended', () => {
  it.each([
    ['2026-06-30', 'AY', 2024], ['2026-07-01', 'AY', 2025], ['2026-12-31', 'CY', 2025], ['2027-01-01', 'CY', 2026],
  ] as const)('on %s the last finished %s starts in %i', (day, type, year) => {
    expect(lastCompletedYear(type, new Date(day))).toBe(year);
  });
});

describe('the sheet', () => {
  it('shows the last finished years, 13 figures in three groups, and none answered yet', async () => {
    const s = await declaredSheet(me, {}, TODAY);
    expect([s.ay, s.cy]).toEqual([2025, 2025]);
    expect(s.rows).toHaveLength(13);
    expect(['since', 'ay', 'cy'].map((g) => s.rows.filter((r) => r.section === g).length)).toEqual([7, 4, 2]);
    expect(s.rows.every((r) => r.value === null)).toBe(true);
    expect(row(s, `${SEMINARS_AY}@2025`).key).toBe(`${SEMINARS_AY}@2025`);
    expect(row(s, since).key).toBe(since);
  });

  it('offers the years from the one of joining to the last that has ended, newest first', async () => {
    const s = await declaredSheet(me, {}, TODAY);
    expect(s.years.ay).toEqual([2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018]);
    expect(s.years.cy).toEqual([2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018]);
    await expect(declaredSheet(me, { ay: 2026 }, TODAY)).rejects.toMatchObject({ code: 'VALIDATION' });     // still running
    await expect(declaredSheet(me, { cy: 2010 }, TODAY)).rejects.toMatchObject({ code: 'VALIDATION' });     // before joining
  });
});

describe('saving', () => {
  it('keeps a figure for its own year only', async () => {
    await saveDeclared(me, [{ counterKey: `${SEMINARS_AY}@2023`, value: 4 }, { counterKey: since, value: 12 }], TODAY);
    const s2023 = await declaredSheet(me, { ay: 2023 }, TODAY);
    expect(row(s2023, `${SEMINARS_AY}@2023`).value).toBe(4);
    expect(row(await declaredSheet(me, { ay: 2024 }, TODAY), `${SEMINARS_AY}@2024`).value).toBeNull();
    expect(row(s2023, since).value).toBe(12);
  });

  it('is read by the report for the year the report is about (the bug: it read a year nobody could fill in)', async () => {
    await saveDeclared(me, [{ counterKey: `${SEMINARS_AY}@2024`, value: 7 }, { counterKey: `${PAPERS_CY}@2024`, value: 3 }], TODAY);
    const figures = (await figuresForUsers([me.id], { from: 2022, to: 2024 })).get(me.id)!;
    expect(figures[SEMINARS_AY]).toBe(7);
    expect(figures[PAPERS_CY]).toBe(3);
    expect(figures[since]).toBe(12);
  });

  it('tells a real zero from no answer, and takes an answer back with null', async () => {
    await saveDeclared(me, [{ counterKey: `${SEMINARS_AY}@2022`, value: 0 }], TODAY);
    expect(row(await declaredSheet(me, { ay: 2022 }, TODAY), `${SEMINARS_AY}@2022`).value).toBe(0);
    await saveDeclared(me, [{ counterKey: `${SEMINARS_AY}@2022`, value: null }], TODAY);
    expect(row(await declaredSheet(me, { ay: 2022 }, TODAY), `${SEMINARS_AY}@2022`).value).toBeNull();
  });

  it('reports only what changed, so only that is audited', async () => {
    const changes = await saveDeclared(me, [
      { counterKey: since, value: 12 },                                  // as it was
      { counterKey: `${SEMINARS_AY}@2023`, value: 5 },                   // 4 to 5
    ], TODAY);
    expect(changes).toEqual([{ key: `${SEMINARS_AY}@2023`, before: 4, after: 5 }]);
  });

  it('saves nothing when one figure is not allowed', async () => {
    await expect(saveDeclared(me, [
      { counterKey: since, value: 99 },
      { counterKey: `${SEMINARS_AY}@2026`, value: 1 },                   // a year still running
    ], TODAY)).rejects.toMatchObject({ code: 'VALIDATION', fields: { [`${SEMINARS_AY}@2026`]: expect.any(String) } });
    expect(row(await declaredSheet(me, {}, TODAY), since).value).toBe(12);
  });

  it.each([
    [SEMINARS_AY, 'a year figure with no year'],
    [`${since}@2024`, 'a total given a year'],
    ['manual.nothing', 'a figure that does not exist'],
    [`${SEMINARS_AY}@1980`, 'a year before 1990'],
    ['publications.count.sinceJoining', 'a figure counted from records'],
  ])('refuses %s (%s)', async (counterKey) => {
    await expect(saveDeclared(me, [{ counterKey, value: 1 }], TODAY)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('accepts only Yes or No for the yes or no figure', async () => {
    await saveDeclared(me, [{ counterKey: 'manual.foreignVisits.lastYear@2024', value: 1 }], TODAY);
    await expect(saveDeclared(me, [{ counterKey: 'manual.foreignVisits.lastYear@2024', value: 5 }], TODAY)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('never touches another person’s figures', async () => {
    expect(row(await declaredSheet(colleague, { ay: 2023 }, TODAY), `${SEMINARS_AY}@2023`).value).toBeNull();
  });
});

describe('what DARP counts, when asked for', () => {
  const fdp = (start: string, end: string, over: Record<string, unknown> = {}) => ({
    programType: 'Short Term Course', organisingInstitution: 'x', organisingInstitutionCode: 'U-0050', startDate: start, endDate: end, ...over,
  });
  const support = (supportDate: string, type: string, title: string, over: Record<string, unknown> = {}) => ({
    purpose: 'Conference/Workshop/Seminar/Symposium, etc', supportDate, title, type, amount: '8000', startDate: supportDate, endDate: supportDate, ...over,
  });
  let counter: SessionUser;

  beforeAll(async () => {
    counter = await makeUser({ role: 'faculty', dept: 'CSE', joined: '2018-08-01' });
    await createRecord(counter, 'fdpattended', fdp('2024-09-02', '2024-09-06'), 'submit');          // AY 2024, CY 2024
    await createRecord(counter, 'fdpattended', fdp('2025-02-03', '2025-02-07', { organisingInstitutionCode: 'U-0391' }), 'submit');   // AY 2024, CY 2025
    await createRecord(counter, 'fdpattended', fdp('2022-05-02', '2022-05-06', { organisingInstitutionCode: 'C-1111' }), 'draft');    // a draft is never counted
    await createRecord(counter, 'finsupport', support('2024-10-10', 'National', 'Seminar A'), 'submit');
    await createRecord(counter, 'finsupport', support('2024-11-11', 'International', 'Seminar B'), 'submit');
    await createRecord(counter, 'finsupport', support('2023-01-05', 'National', 'Seminar C'), 'submit');
    await createRecord(colleague, 'fdpattended', fdp('2024-09-02', '2024-09-06', { organisingInstitutionCode: 'ROR-04paris01' }), 'submit');       // someone else's
  });

  it('is left out until asked for', async () => {
    expect((await declaredSheet(counter, { ay: 2024 }, TODAY)).rows.every((r) => r.counted === undefined)).toBe(true);
  });

  it('counts FDPs by academic year, and every year since joining', async () => {
    const s = await declaredSheet(counter, { ay: 2024, cy: 2024, counted: true }, TODAY);
    expect(row(s, 'manual.workshops.attended.cycle@2024').counted).toMatchObject({ value: 2, moduleKey: 'fdpattended' });
    expect(row(s, 'manual.workshops.attended.sinceJoining').counted).toMatchObject({ value: 2 });          // the draft and the colleague's are out
  });

  it('splits financial support into national and international, by year', async () => {
    const s = await declaredSheet(counter, { ay: 2024, cy: 2024, counted: true }, TODAY);
    expect(row(s, 'manual.seminars.national.cycle@2024').counted).toMatchObject({ value: 1, moduleKey: 'finsupport' });
    expect(row(s, 'manual.seminars.international.cycle@2024').counted).toMatchObject({ value: 1 });
    expect(row(s, 'manual.seminars.national.sinceJoining').counted).toMatchObject({ value: 2 });           // two national, in two years
    expect(row(s, 'manual.seminars.national.cycle@2024').counted!.note).toMatch(/financial support/i);
  });

  it('says plainly where there is nothing to count', async () => {
    const s = await declaredSheet(counter, { counted: true }, TODAY);
    expect(row(s, 'manual.foreignVisits.count.sinceJoining').counted).toEqual({ value: null, note: 'DARP has no records for this.', moduleKey: null });
    expect(row(s, 'manual.papersPresented.national.sinceJoining').counted!.note).toMatch(/not split/i);
  });
});
