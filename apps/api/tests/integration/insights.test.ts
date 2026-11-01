import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { records, users, paperCitations, journalJcr } from '@/server/db/schema';
import { storeJcrRows, clearJournalList } from '@/server/lookup/journals';
import { counterValuesFor } from '@/server/rollups/completion';
import {
  personInsights, departmentInsights, collegeInsights, getHIndexPapers, setHIndexPapers,
} from '@/server/rollups/insights';
import type { SessionUser } from '@/server/auth/session';

/*
 * Phase 3 of the visual-insights plan: the figures for a person, a department and the college. Who may
 * see what is the heart of it; then the numbers (one counting rule, a department h-index worked out from
 * its papers' citations), IQAC's setting, privacy and the to-do list.
 */

let a1: SessionUser; let a2: SessionUser; let hodC: SessionUser;       // CSE: two faculty and the head
let b1: SessionUser; let hodM: SessionUser;                              // ME
let dofa: SessionUser; let drie: SessionUser; let dugs: SessionUser; let iqac: SessionUser; let cdc: SessionUser;

async function named(u: SessionUser, first: string, last: string) {
  await db.update(users).set({ name: `${first} ${last}`, firstName: first, lastName: last }).where(eq(users.id, u.id));
}

type Over = { status?: 'draft' | 'approved' | 'submitted' | 'returned'; year?: number; module?: string };
async function put(owner: SessionUser, data: Record<string, unknown>, over: Over = {}) {
  const [r] = await db.insert(records).values({
    moduleKey: over.module ?? 'publications', ownerUserId: owner.id, createdBy: owner.id, departmentId: owner.departmentId,
    status: over.status ?? 'approved', periodLabel: String(over.year ?? 2024), periodYear: over.year ?? 2024, data,
  }).returning();
  return r!;
}
const paper = (owner: SessionUser, doi: string, extra: Record<string, unknown> = {}, over: Over = {}) =>
  put(owner, { doi, title: `Paper ${doi}`, journal: 'Journal of Tests', authors: owner.name, ...extra }, over);
const cite = (doi: string, citedBy: number, found = true) =>
  db.insert(paperCitations).values({ doi, citedBy, found, checkedAt: new Date('2026-10-01') });

const FORBIDDEN = { code: 'FORBIDDEN' };

async function wipeRecords() {
  await db.delete(paperCitations);
  await db.delete(records);
}

beforeAll(async () => {
  await truncateAll();
  [a1, a2, hodC] = [await makeUser({ role: 'faculty', dept: 'CSE' }), await makeUser({ role: 'faculty', dept: 'CSE' }), await makeUser({ role: 'hod', dept: 'CSE' })];
  [b1, hodM] = [await makeUser({ role: 'faculty', dept: 'ME' }), await makeUser({ role: 'hod', dept: 'ME' })];
  [dofa, drie, dugs, iqac, cdc] = [
    await makeUser({ role: 'dofa' }), await makeUser({ role: 'drie' }), await makeUser({ role: 'dugs' }),
    await makeUser({ role: 'admin' }), await makeUser({ role: 'cdc' }),
  ];
  await named(a1, 'Anil', 'Verma'); await named(a2, 'Sunita', 'Rao'); await named(b1, 'Rakesh', 'Mahato');
  a1.name = 'Anil Verma'; a2.name = 'Sunita Rao'; b1.name = 'Rakesh Mahato';
});
afterEach(async () => {
  await wipeRecords();
  await db.delete(journalJcr).where(inArray(journalJcr.issn, ['99970001', '99970002']));
  await clearJournalList('jcr', 2095);
  await setHIndexPapers(iqac, 'all');
});
afterAll(async () => { await closeDb(); });

describe('who sees what', () => {
  it('lets faculty and a head see their own department, and nothing of another one or of the college', async () => {
    for (const viewer of [a1, hodC]) {
      await expect(departmentInsights(viewer, 'CSE', null)).resolves.toMatchObject({ department: { code: 'CSE' } });
      await expect(departmentInsights(viewer, 'ME', null)).rejects.toMatchObject(FORBIDDEN);
      await expect(collegeInsights(viewer, null)).rejects.toMatchObject(FORBIDDEN);
      await expect(personInsights(viewer, viewer.id, null)).resolves.toMatchObject({ person: { userId: viewer.id } });
      await expect(personInsights(viewer, a2.id, null)).resolves.toMatchObject({ person: { userId: a2.id } });   // a colleague
      await expect(personInsights(viewer, b1.id, null)).rejects.toMatchObject(FORBIDDEN);                        // another department's
    }
  });

  it('lets the deans and IQAC see every department, the college and every person', async () => {
    for (const viewer of [dofa, drie, dugs, iqac]) {
      await expect(departmentInsights(viewer, 'CSE', null)).resolves.toBeDefined();
      await expect(departmentInsights(viewer, 'ME', null)).resolves.toBeDefined();
      await expect(collegeInsights(viewer, null)).resolves.toBeDefined();
      await expect(personInsights(viewer, a1.id, null)).resolves.toBeDefined();
      await expect(personInsights(viewer, b1.id, null)).resolves.toBeDefined();
    }
  });

  it('shows CDC neither department, nor the college, nor anyone else’s page', async () => {
    await expect(departmentInsights(cdc, 'CSE', null)).rejects.toMatchObject(FORBIDDEN);
    await expect(departmentInsights(cdc, 'ME', null)).rejects.toMatchObject(FORBIDDEN);
    await expect(collegeInsights(cdc, null)).rejects.toMatchObject(FORBIDDEN);
    await expect(personInsights(cdc, a1.id, null)).rejects.toMatchObject(FORBIDDEN);
    await expect(personInsights(cdc, cdc.id, null)).resolves.toBeDefined();                                      // their own is fine
  });

  it('says not found for a department or a person that does not exist, and ignores the case of a code', async () => {
    await expect(departmentInsights(iqac, 'NOPE', null)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(personInsights(iqac, '00000000-0000-0000-0000-000000000001', null)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(departmentInsights(a1, 'cse', null)).resolves.toMatchObject({ department: { code: 'CSE' } });
  });
});

describe('the department h-index', () => {
  it('comes from the citations of the department’s papers together: not the sum, or the average, of the people’s', async () => {
    for (const [owner, doi, n] of [[a1, '10.1/a', 10], [a1, '10.1/b', 5], [a1, '10.1/c', 3], [a2, '10.1/d', 8], [a2, '10.1/e', 4]] as const) {
      await paper(owner, doi); await cite(doi, n);
    }
    const dept = await departmentInsights(hodC, 'CSE', null);
    expect(dept.citations).toMatchObject({ citations: 30, hIndex: 4, found: 5, notInScopus: 0, notChecked: 0, noDoi: 0, counts: 'all' });
    const cards = Object.fromEntries(dept.faculty.map((c) => [c.userId, c]));
    expect(cards[a1.id]).toMatchObject({ papers: 3, citations: 18, hIndex: 3 });
    expect(cards[a2.id]).toMatchObject({ papers: 2, citations: 12, hIndex: 2 });
    expect(dept.citations.hIndex).not.toBe(cards[a1.id]!.hIndex + cards[a2.id]!.hIndex);
  });

  it('sorts a paper into found, not in Scopus, not checked yet, and no DOI', async () => {
    await paper(a1, '10.1/found'); await cite('10.1/found', 7);
    await paper(a1, '10.1/gone'); await cite('10.1/gone', 0, false);
    await paper(a1, '10.1/new');
    await paper(a1, '');
    const c = (await departmentInsights(a1, 'CSE', null)).citations;
    expect(c).toMatchObject({ found: 1, notInScopus: 1, notChecked: 1, noDoi: 1, citations: 7, hIndex: 1 });
    expect(c.lastChecked).not.toBeNull();
  });

  it('counts the same paper once, written in another case, or entered by two colleagues', async () => {
    await paper(a1, '10.1/Same', { authors: 'Anil Verma, Sunita Rao' }); await paper(a2, '10.1/SAME', { authors: 'Anil Verma, Sunita Rao' });
    await cite('10.1/same', 9);
    const d = await departmentInsights(a1, 'CSE', null);
    expect(d.counts.papers).toBe(1);
    expect(d.citations).toMatchObject({ citations: 9, found: 1 });
  });
});

describe('IQAC’s setting: which papers the h-index counts', () => {
  async function setUp() {
    await paper(a1, '10.1/at-bit'); await cite('10.1/at-bit', 5);
    await paper(a1, '10.1/before-bit', { affiliatedToBit: 'No' }); await cite('10.1/before-bit', 50);
  }

  it('counts a paper answered “No” towards the h-index by default, and leaves it out of every other figure', async () => {
    await setUp();
    expect(await getHIndexPapers()).toBe('all');
    const d = await departmentInsights(a1, 'CSE', null);
    expect(d.citations).toMatchObject({ citations: 55, hIndex: 2, counts: 'all' });
    expect(d.counts.papers).toBe(1);
    expect(d.byYear).toEqual([expect.objectContaining({ year: 2024, papers: 1 })]);
  });

  it('counts only papers done at BIT when IQAC says so, and the answer follows at once', async () => {
    await setUp();
    await setHIndexPapers(iqac, 'at-bit');
    const d = await departmentInsights(a1, 'CSE', null);
    expect(d.citations).toMatchObject({ citations: 5, hIndex: 1, counts: 'at-bit' });
    await setHIndexPapers(iqac, 'all');
    expect((await departmentInsights(a1, 'CSE', null)).citations).toMatchObject({ citations: 55, hIndex: 2 });
  });

  it('may be changed by IQAC only, to one of two values', async () => {
    await expect(setHIndexPapers(hodC, 'at-bit')).rejects.toMatchObject(FORBIDDEN);
    await expect(setHIndexPapers(dofa, 'at-bit')).rejects.toMatchObject(FORBIDDEN);
    await expect(setHIndexPapers(iqac, 'some' as 'all')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await getHIndexPapers()).toBe('all');
  });
});

describe('what is counted', () => {
  it('leaves out a draft and a record answered “No”, in every count', async () => {
    await paper(a1, '10.1/ok');
    await paper(a1, '10.1/draft', {}, { status: 'draft' });
    await paper(a1, '10.1/returned', {}, { status: 'returned' });
    await paper(a1, '10.1/no', { affiliatedToBit: 'No' });
    const p = await personInsights(a1, a1.id, null);
    expect(p.counts.papers).toBe(1);
    expect(p.recentPapers.map((r) => r.doi)).toEqual(['10.1/ok']);
    expect(p.citations.found + p.citations.notChecked).toBe(2);                          // the “No” paper is in the h-index, the drafts are not
  });

  it('gives a person the very counts their profile does', async () => {
    await paper(a1, '10.1/p1', {}, { year: 2023 }); await paper(a1, '10.1/p2', {}, { year: 2024 }); await paper(a1, '10.1/p3', {}, { year: 2020 });
    await put(a1, { publicationType: 'Book', title: 'B', authors: 'A' }, { module: 'books', year: 2024 });
    await put(a1, { publicationType: 'Book chapter', title: 'C', authors: 'A' }, { module: 'books', year: 2023 });
    await put(a1, { role: 'PI', amount: '500000', title: 'G', agency: 'SERB', sanctionDate: '2023-04-01' }, { module: 'grants', year: 2023 });
    await put(a1, { role: 'Co-PI', amount: '200000', title: 'H', agency: 'DST', sanctionDate: '2024-04-01' }, { module: 'grants', year: 2024 });
    await put(a1, { recordType: 'Consultancy', revenue: '90000', title: 'K' }, { module: 'consultancy', year: 2024 });
    await put(a1, { title: 'Pat', status: 'Granted', filedDate: '2022-02-01', publishedDate: '2023-02-01', grantDate: '2024-02-01' }, { module: 'patents', year: 2022 });
    const range = { from: 2023, to: 2024 };
    const mine = await counterValuesFor(a1, a1.id, range);
    const v = (k: string) => mine.computed.find((c) => c.key === k)!.value;
    const p = await personInsights(a1, a1.id, range);
    expect(p.counts).toMatchObject({
      papers: v('publications.count.cycle'), books: v('books.count.book.cycle'), chapters: v('books.count.chapter.cycle'),
      projects: v('grants.count.pi.cycle') + v('grants.count.copi.cycle'),
      projectFunding: v('grants.sum.pi.cycle') + v('grants.sum.copi.cycle'),
      consultancyRevenue: v('consultancy.sum.consultancy.cycle'),
      patentsFiled: v('patents.count.filed.cycle'), patentsPublished: v('patents.count.published.cycle'), patentsGranted: v('patents.count.granted.cycle'),
    });
    expect(p.counts).toMatchObject({ papers: 2, books: 1, chapters: 1, projects: 2, projectFunding: 700000, consultancyRevenue: 90000, patentsFiled: 0, patentsPublished: 1, patentsGranted: 1 });
  });

  it('limits the counts, the years and the citations to the chosen years', async () => {
    await paper(a1, '10.1/old', {}, { year: 2019 }); await cite('10.1/old', 40);
    await paper(a1, '10.1/new', {}, { year: 2024 }); await cite('10.1/new', 6);
    const all = await personInsights(a1, a1.id, null);
    expect(all.range).toBeNull();
    expect(all.byYear.map((y) => y.year)).toEqual([2019, 2024]);
    expect(all.citations).toMatchObject({ citations: 46, hIndex: 2 });
    const some = await personInsights(a1, a1.id, { from: 2022, to: 2025 });
    expect(some.range).toEqual({ from: 2022, to: 2025 });
    expect(some.counts.papers).toBe(1);
    expect(some.byYear.map((y) => y.year)).toEqual([2024]);
    expect(some.citations).toMatchObject({ citations: 6, hIndex: 1, found: 1 });
  });

  it('adds up the years in order with their papers, books, patents, projects and funding', async () => {
    await paper(a1, '10.1/y1', {}, { year: 2022 }); await paper(a1, '10.1/y2', {}, { year: 2022 });
    await put(a1, { role: 'PI', amount: '100000', title: 'G', agency: 'SERB' }, { module: 'grants', year: 2021 });
    const p = await personInsights(a1, a1.id, null);
    expect(p.byYear).toEqual([
      { year: 2021, papers: 0, books: 0, patents: 0, projects: 1, funding: 100000 },
      { year: 2022, papers: 2, books: 0, patents: 0, projects: 0, funding: 0 },
    ]);
    expect(p.funders).toEqual([{ agency: 'SERB', projects: 1, amount: 100000 }]);
    expect(p.topJournals).toEqual([{ journal: 'Journal of Tests', papers: 2, jif: null }]);
  });
});

describe('a paper with an author in another department', () => {
  it('counts for both departments, and once for the college', async () => {
    await paper(a1, '10.1/joint', { authors: 'A. K. Verma, R. Mahato' }); await cite('10.1/joint', 12);
    await paper(a2, '10.1/solo', { authors: 'S. Rao' }); await cite('10.1/solo', 3);
    const cse = await departmentInsights(iqac, 'CSE', null);
    const me = await departmentInsights(iqac, 'ME', null);
    expect(cse.counts.papers).toBe(2);
    expect(me.counts.papers).toBe(1);
    expect(me.citations).toMatchObject({ citations: 12, hIndex: 1 });
    expect(me.recentPapers.map((r) => r.doi)).toEqual(['10.1/joint']);
    const college = await collegeInsights(iqac, null);
    expect(college.counts.papers).toBe(2);
    expect(college.citations).toMatchObject({ citations: 15, hIndex: 2 });
    const row = (code: string) => college.departments.find((d) => d.code === code)!;
    expect(row('CSE')).toMatchObject({ papers: 2, citations: 15, hIndex: 2 });
    expect(row('ME')).toMatchObject({ papers: 1, citations: 12, hIndex: 1 });
  });

  it('does not count a paper that merely names someone else, or a person with the same surname but another first name', async () => {
    await paper(a2, '10.1/other', { authors: 'S. Rao, Priya Mahato' });
    expect((await departmentInsights(iqac, 'ME', null)).counts.papers).toBe(0);
  });

  it('gives the college the sum of the people’s own counts for work that is nobody else’s', async () => {
    await put(a1, { role: 'PI', amount: '300000', title: 'One', agency: 'SERB' }, { module: 'grants' });
    await put(b1, { role: 'PI', amount: '200000', title: 'Two', agency: 'DST' }, { module: 'grants' });
    const college = await collegeInsights(dugs, null);
    const sum = (k: 'projects' | 'funding') => college.departments.reduce((a, d) => a + d[k], 0);
    expect(college.counts.projects).toBe(2);
    expect(sum('projects')).toBe(2);
    expect(college.counts.projectFunding).toBe(500000);
    expect(sum('funding')).toBe(500000);
    expect(college.facultyTotal).toBe(college.departments.reduce((a, d) => a + d.faculty, 0));
  });

  it('lists the people with their designation, and who has entered anything', async () => {
    await put(a1, { designation: 'Professor' }, { module: 'profile' });
    await paper(a1, '10.1/x');
    const d = await departmentInsights(hodC, 'CSE', null);
    expect(d.facultyTotal).toBe(3);                                                   // a1, a2 and the head
    expect(d.reporting).toBe(1);
    expect(d.designations).toEqual(expect.arrayContaining([{ designation: 'Professor', people: 1 }, { designation: 'Not filled in', people: 2 }]));
    expect(d.faculty[0]).toMatchObject({ userId: a1.id, name: 'Anil Verma', designation: 'Professor', papers: 1 });
  });
});

describe('the journal lists, read live', () => {
  it('moves a paper to another quartile at once when IQAC loads another Journal Citation Reports list', async () => {
    await storeJcrRows(2095, [{ issn: '99970001', title: 'Live Journal', jif: '9.1', jifQuartile: 'Q1', categories: 'X', editions: 'SCIE' }]);
    await paper(a1, '10.1/live', { issn: '99970001', journal: 'Live Journal' });
    const before = await personInsights(a1, a1.id, null);
    expect(before.jif).toEqual({ q1: 1, q2: 0, q3: 0, q4: 0, none: 0 });
    expect(before.recentPapers[0]).toMatchObject({ jif: '9.1', quartile: 'Q1' });
    await clearJournalList('jcr', 2095);                                             // loading a year replaces it
    await storeJcrRows(2095, [{ issn: '99970001', title: 'Live Journal', jif: '1.2', jifQuartile: 'Q3', categories: 'X', editions: 'SCIE' }]);
    const after = await personInsights(a1, a1.id, null);
    expect(after.jif).toEqual({ q1: 0, q2: 0, q3: 1, q4: 0, none: 0 });
    expect(after.recentPapers[0]).toMatchObject({ jif: '1.2', quartile: 'Q3' });
    expect((await departmentInsights(a1, 'CSE', null)).jif.q3).toBe(1);
  });
});

describe('privacy', () => {
  it('puts no e-mail, phone, PAN, Aadhaar or pay in any answer, and no money against a person on a department or college page', async () => {
    await put(a1, { designation: 'Professor', pan: 'ABCDE1234F', aadhaar: '123412341234', email: 'a1@secret.example' }, { module: 'profile' });
    await put(a1, { role: 'PI', amount: '300000', title: 'One', agency: 'SERB' }, { module: 'grants' });
    await put(a1, { studentName: 'Student', level: 'PHD', payPackage: '1200000', email: 's@secret.example', phone: '9876543210', yearOfPassing: 2024, statusAfterPassing: 'Employed' }, { module: 'studentsguided' });
    await paper(a1, '10.1/p');
    const answers = [
      await personInsights(iqac, a1.id, null), await personInsights(a2, a1.id, null),
      await departmentInsights(iqac, 'CSE', null), await collegeInsights(iqac, null),
    ];
    for (const a of answers) {
      const text = JSON.stringify(a);
      for (const bad of ['@bitmesra', '@secret', 'payPackage', '1200000', 'ABCDE1234F', '123412341234', '9876543210', 'aadhaar', 'phone']) {
        expect(text, `found ${bad}`).not.toContain(bad);
      }
    }
    for (const card of [...(answers[2] as { faculty: object[] }).faculty, ...(answers[3] as { topByPapers: object[] }).topByPapers]) {
      expect(Object.keys(card).sort()).toEqual(['citations', 'department', 'departmentCode', 'designation', 'hIndex', 'name', 'orcid', 'papers', 'patents', 'userId']);
    }
  });

  it('shows money on a person’s page to the person, their head and the deans and IQAC, but not to a colleague', async () => {
    await put(a1, { role: 'PI', amount: '300000', title: 'One', agency: 'SERB', sanctionDate: '2024-05-01' }, { module: 'grants' });
    for (const viewer of [a1, hodC, dofa, iqac]) {
      const p = await personInsights(viewer, a1.id, null);
      expect(p.counts.projectFunding, `viewer ${viewer.role}`).toBe(300000);
      expect(p.projects[0]!.amount).toBe(300000);
    }
    const seen = await personInsights(a2, a1.id, null);
    expect(seen.counts.projects).toBe(1);
    expect(seen.counts.projectFunding).toBe(0);
    expect(seen.projects[0]).toMatchObject({ title: 'One', amount: 0 });
    expect(seen.byYear.every((y) => y.funding === 0)).toBe(true);
    expect(seen.funders.every((f) => f.amount === 0)).toBe(true);
  });

  it('shows a department’s funding and consultancy totals', async () => {
    await put(a1, { role: 'PI', amount: '300000', title: 'One', agency: 'SERB' }, { module: 'grants' });
    await put(a2, { recordType: 'Consultancy', revenue: '90000', title: 'K' }, { module: 'consultancy' });
    const d = await departmentInsights(a2, 'CSE', null);
    expect(d.counts).toMatchObject({ projectFunding: 300000, consultancyRevenue: 90000 });
  });
});

describe('the person’s page', () => {
  it('shows the identifiers, qualifications, awards, projects, theses, patents and frequent co-authors', async () => {
    await db.update(users).set({ orcid: '0000-0002-1825-0097', scopusAuthorId: '57200000001' }).where(eq(users.id, a1.id));
    await put(a1, { designation: 'Professor', ugQualification: 'B.Tech', ugInstitution: 'IIT Kharagpur', hasPhd: 'Yes', phdInstitution: 'IIT Delhi', teachingExperienceMonths: '120' }, { module: 'profile' });
    await put(a1, { awardName: 'Young Scientist', agency: 'DST', awardDate: '2023-03-01' }, { module: 'awards' });
    await put(a1, { activityType: 'Member of a Board of Studies, Academic Council or other academic body', bodyName: 'BoS, IIT X', bodyKind: 'Board of Studies', memberFrom: '2021', memberTo: '2024' }, { module: 'outreach' });
    await put(a1, { studentName: 'Ravi', level: 'PHD', yearOfPassing: 2024, statusAfterPassing: 'Employed' }, { module: 'studentsguided' });
    await put(a1, { studentName: 'Meena', level: 'UG', yearOfPassing: 2024, statusAfterPassing: 'Employed' }, { module: 'studentsguided' });
    await put(a1, { title: 'Pat', status: 'Granted', applicationNo: '202431000001', patentNumber: '555555', grantDate: '2024-02-01' }, { module: 'patents' });
    await paper(a1, '10.1/c1', { authors: 'A. Verma, Priya Nair, Q. Zed' }); await paper(a1, '10.1/c2', { authors: 'Anil Verma, Priya Nair' });
    const p = await personInsights(a2, a1.id, null);
    expect(p.person).toMatchObject({
      name: 'Anil Verma', designation: 'Professor', department: expect.any(String), departmentCode: 'CSE', orcid: '0000-0002-1825-0097',
      scopusAuthorId: '57200000001', experienceMonths: 120,
      education: [{ level: 'UG', degree: 'B.Tech', institute: 'IIT Kharagpur' }, { level: 'PhD', degree: 'PhD', institute: 'IIT Delhi' }],
    });
    expect(p.awards).toEqual([expect.objectContaining({ title: 'Young Scientist', by: 'DST', date: '2023-03-01' })]);
    expect(p.memberships).toEqual([expect.objectContaining({ body: 'BoS, IIT X', from: '2021', to: '2024' })]);
    expect(p.theses).toEqual([expect.objectContaining({ student: 'Ravi', year: 2024 })]);
    expect(p.patents).toEqual([expect.objectContaining({ title: 'Pat', number: '555555', status: 'Granted' })]);
    expect(p.coAuthors).toEqual([{ name: 'Priya Nair', papers: 2 }]);
  });
});

describe('what to do next', () => {
  let who: SessionUser;
  beforeAll(async () => {
    who = await makeUser({ role: 'faculty', dept: 'CSE' });
    await db.update(users).set({ dateOfJoining: null, orcid: null }).where(eq(users.id, who.id));
    who.dateOfJoining = null;
  });
  const keys = async (viewer = who, of = who) => (await personInsights(viewer, of.id, null)).todo.map((t) => t.key);

  it('starts with everything that is missing, most urgent first', async () => {
    expect(await keys()).toEqual(['profile', 'joining', 'orcid', 'start']);
    const todo = (await personInsights(who, who.id, null)).todo;
    expect(todo[0]).toMatchObject({ key: 'profile', href: '/m/profile/new', tone: 'danger' });
    expect(todo.find((t) => t.key === 'start')!.count).toBeGreaterThan(5);
  });

  it('adds returned records, drafts and records with no “done at BIT?” answer, and drops what is done', async () => {
    await put(who, { designation: 'Professor' }, { module: 'profile' });
    await db.update(users).set({ dateOfJoining: '2015-07-01', orcid: '0000-0002-1825-0097' }).where(eq(users.id, who.id));
    who.dateOfJoining = '2015-07-01';
    await paper(who, '10.1/returned', {}, { status: 'returned' });
    await paper(who, '10.1/draft1', {}, { status: 'draft' }); await paper(who, '10.1/draft2', {}, { status: 'draft' });
    await paper(who, '10.1/answered', { affiliatedToBit: 'Yes' });
    const todo = (await personInsights(who, who.id, null)).todo;
    expect(todo.map((t) => t.key)).toEqual(['returned', 'drafts', 'answer', 'start']);
    expect(todo[0]).toMatchObject({ label: '1 record came back to you', href: '/m/publications?status=returned', tone: 'danger' });
    expect(todo[1]).toMatchObject({ label: '2 drafts to finish', count: 2, href: '/m/publications?status=draft', tone: 'warning' });
    expect(todo[2]).toMatchObject({ count: 3, tone: 'info' });                         // the three that were not answered
  });

  it('is shown to the person alone', async () => {
    expect(await keys(a1, a1)).not.toEqual([]);
    expect(await keys(iqac, who)).toEqual([]);
    expect(await keys(hodC, who)).toEqual([]);
    expect(await keys(a2, a1)).toEqual([]);
  });
});
