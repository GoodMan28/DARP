import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, max } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { loadTestInstitutes } from '../helpers/institutes';
import { createRecord, listRecords, exportRows } from '@/server/records/service';
import { toCsv, toXlsx } from '@/server/records/viewExport';
import { viewColumnsFor } from '@/server/records/viewQuery';
import { listSavedViews, createSavedView, deleteSavedView } from '@/server/records/savedViews';
import { journalIndexListings, journalJcr } from '@/server/db/schema';
import { getModule } from '@darp/shared/modules';
import { cleanView, describeView, encodeView, decodeView, type Condition, type ViewState } from '@darp/shared/views';
import type { SessionUser } from '@/server/auth/session';

/* Filter, sort, group, show/hide columns, export and saved views on a module's list. */

let faculty: SessionUser;
let colleague: SessionUser;
let hodCse: SessionUser;
let admin: SessionUser;

const fellowship = (name: string, o: Record<string, unknown>) => ({
  supportType: 'National fellowship', name, amount: '50000', purpose: 'Research visit', stature: 'National',
  agency: 'DST', agencyCode: 'ROR-07serb001', awardDate: '2024-03-15', validityYears: '2', ...o,
});

const c = (field: string, op: Condition['op'], value?: string[], value2?: string): Condition => ({ field, op, ...(value ? { value } : {}), ...(value2 ? { value2 } : {}) });
const view = (...items: ViewState['filter']['items']): ViewState => ({ filter: { join: 'and', items }, sort: [], cols: null, groupBy: null });
const names = async (actor: SessionUser, key: string, v: ViewState | Record<string, unknown>) =>
  (await listRecords(actor, key, { view: v, pageSize: 100 })).rows.map((r) => String(r.data.name ?? r.data.title ?? r.data.doi)).sort();

beforeAll(async () => {
  await truncateAll();
  await loadTestInstitutes();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  colleague = await makeUser({ role: 'faculty', dept: 'ME' });
  hodCse = await makeUser({ role: 'hod', dept: 'CSE' });
  admin = await makeUser({ role: 'admin' });
  const make = (u: SessionUser, name: string, o: Record<string, unknown>) => createRecord(u, 'fellowships', fellowship(name, o), 'submit');
  await make(faculty, 'INSA visiting', { amount: '50000', stature: 'National', awardDate: '2022-02-10', validityYears: '2' });          // ended 09-02-2024
  await make(faculty, 'Humboldt', { amount: '900000', stature: 'International', awardDate: '2025-06-01', validityYears: '5' });        // valid to 2030
  await make(faculty, 'DST travel', { amount: '20000', stature: 'National', awardDate: '2024-03-15', validityYears: '', validForLife: true });
  await make(faculty, '=HYPERLINK("http://example.com")', { amount: '1000', stature: 'National', awardDate: '2025-01-01', validityYears: '1' });
  await make(colleague, 'Colleague grant', { amount: '70000', stature: 'International', awardDate: '2025-02-01', validityYears: '3' });
});
afterAll(async () => { await closeDb(); });

describe('filter conditions', () => {
  it('filters text, numbers, dates, choices and empties', async () => {
    expect(await names(faculty, 'fellowships', view(c('name', 'contains', ['inSA'])))).toEqual(['INSA visiting']);
    expect(await names(faculty, 'fellowships', view(c('amount', 'between', ['30000'], '100000')))).toEqual(['INSA visiting']);
    expect(await names(faculty, 'fellowships', view(c('amount', 'between', ['100000'], '30000')))).toEqual(['INSA visiting']);   // either order
    expect(await names(faculty, 'fellowships', view(c('awardDate', 'lt', ['2025-01-01'])))).toEqual(['DST travel', 'INSA visiting']);
    expect(await names(faculty, 'fellowships', view(c('stature', 'isAnyOf', ['International'])))).toEqual(['Humboldt']);
    expect(await names(faculty, 'fellowships', view(c('stature', 'isNot', ['National'])))).toEqual(['Humboldt']);
    expect(await names(faculty, 'fellowships', view(c('validityYears', 'isEmpty')))).toEqual(['DST travel']);
    expect(await names(faculty, 'fellowships', view(c('validForLife', 'isTrue')))).toEqual(['DST travel']);
    expect(await names(faculty, 'fellowships', view(c('name', 'startsWith', ['hum'])))).toEqual(['Humboldt']);
  });

  it('joins with and / or, and with groups of conditions', async () => {
    const orGroup = { join: 'or' as const, items: [c('name', 'contains', ['humboldt']), c('name', 'contains', ['dst'])] };
    expect(await names(faculty, 'fellowships', view(orGroup))).toEqual(['DST travel', 'Humboldt']);
    // (humboldt OR dst) AND amount > 25000 → Humboldt only
    expect(await names(faculty, 'fellowships', view(orGroup, c('amount', 'gt', ['25000'])))).toEqual(['Humboldt']);
    // The top level joined with "or": amount > 500000 OR name contains insa
    expect(await names(faculty, 'fellowships', { ...view(c('amount', 'gt', ['500000']), c('name', 'contains', ['insa'])), filter: { join: 'or', items: [c('amount', 'gt', ['500000']), c('name', 'contains', ['insa'])] } }))
      .toEqual(['Humboldt', 'INSA visiting']);
  });

  it('works out validity from the dates', async () => {
    const today = view(c('validUntil', 'validToday'));
    expect(await names(faculty, 'fellowships', today)).toEqual(['DST travel', 'Humboldt']);
    expect(await names(faculty, 'fellowships', view(c('validUntil', 'expired')))).toEqual(['=HYPERLINK("http://example.com")', 'INSA visiting']);
    expect(await names(faculty, 'fellowships', view(c('validUntil', 'lifetime')))).toEqual(['DST travel']);
    expect(await names(faculty, 'fellowships', view(c('validUntil', 'lt', ['2025-01-01'])))).toEqual(['INSA visiting']);
  });

  it('ignores what it does not know, and never runs a value as SQL', async () => {
    expect(await names(faculty, 'fellowships', view(c('nope', 'contains', ['x']), c('name', 'bogusOp' as never, ['x'])))).toHaveLength(4);
    expect(await names(faculty, 'fellowships', view(c('amount', 'gt', ['not a number'])))).toHaveLength(4);   // waiting for a value: dropped
    const evil = "'; drop table records; --";
    expect(await names(faculty, 'fellowships', view(c('name', 'contains', [evil])))).toEqual([]);
    expect(await names(faculty, 'fellowships', view(c('stature', 'is', [evil])))).toEqual([]);
    expect(await names(faculty, 'fellowships', {})).toHaveLength(4);                                          // the table is still there
  });

  it('treats % and _ in a search as plain text', async () => {
    expect(await names(faculty, 'fellowships', view(c('name', 'contains', ['%'])))).toEqual([]);
    expect(await names(faculty, 'fellowships', view(c('name', 'contains', ['_'])))).toEqual([]);
  });
});

describe('scope', () => {
  it('never lets a filter reach a colleague’s records', async () => {
    expect(await names(faculty, 'fellowships', view(c('name', 'contains', ['colleague'])))).toEqual([]);
    expect(await names(faculty, 'fellowships', view(c('@department', 'isNot', ['00000000-0000-0000-0000-000000000000'])))).toHaveLength(4);
    expect(await names(colleague, 'fellowships', {})).toEqual(['Colleague grant']);
  });

  it('keeps a HOD to their department, and gives IQAC everyone, with the record’s own facts as columns', async () => {
    expect(await names(hodCse, 'fellowships', {})).toHaveLength(4);
    expect(await names(admin, 'fellowships', {})).toHaveLength(5);
    expect(await names(admin, 'fellowships', view(c('@owner', 'contains', [colleague.name])))).toEqual(['Colleague grant']);
    // Humboldt (1 June 2025) is in FY 2025-26; the others were awarded earlier in FY 2024-25 or before.
    expect(await names(admin, 'fellowships', view(c('@status', 'is', ['approved']), c('@fy', 'eq', ['2025'])))).toEqual(['Humboldt']);
  });

  it('does not offer protected fields as columns', async () => {
    const cols = await viewColumnsFor(getModule('profile')!);
    const keys = cols.map((x) => x.key);
    expect(keys).not.toContain('pan');
    expect(keys).not.toContain('aadhaar');
    expect(keys).toContain('designation');
    const stud = await viewColumnsFor(getModule('studentsguided')!);
    expect(stud.map((x) => x.key)).not.toContain('personalEmail');
  });
});

describe('sort, group and columns', () => {
  it('sorts by up to three keys, numbers as numbers', async () => {
    const order = async (sort: ViewState['sort']) =>
      (await listRecords(faculty, 'fellowships', { view: { sort }, pageSize: 100 })).rows.map((r) => r.data.name);
    expect(await order([{ field: 'amount', dir: 'desc' }])).toEqual(['Humboldt', 'INSA visiting', 'DST travel', '=HYPERLINK("http://example.com")']);
    expect(await order([{ field: 'stature', dir: 'asc' }, { field: 'amount', dir: 'asc' }]))
      .toEqual(['Humboldt', '=HYPERLINK("http://example.com")', 'DST travel', 'INSA visiting']);
  });

  it('groups with every group’s size across all pages', async () => {
    const r = await listRecords(faculty, 'fellowships', { view: { groupBy: 'stature' }, pageSize: 5 });
    expect(r.groups).toEqual([{ label: 'International', count: 1 }, { label: 'National', count: 3 }]);
    expect(r.rows.map((x) => x.group)).toEqual(['International', 'National', 'National', 'National']);
  });

  it('keeps only real columns, and round-trips through an address', async () => {
    const cols = await viewColumnsFor(getModule('fellowships')!);
    const v = cleanView({ cols: ['name', 'amount', 'pan', '@owner', 'nope'], sort: [{ field: 'validUntil', dir: 'asc' }], groupBy: 'name' }, cols);
    expect(v).toMatchObject({ cols: ['name', 'amount'], sort: [], groupBy: null });   // derived and free-text columns cannot be sorted or grouped
    const full: ViewState = { ...view(c('amount', 'gt', ['1000'])), sort: [{ field: 'amount', dir: 'desc' }], groupBy: 'stature', cols: ['name', 'amount'] };
    expect(decodeView(encodeView(full), cols)).toEqual(full);
    expect(describeView(full, cols)).toContain('Where Financial support (amount in INR) > 1000');
  });
});

describe('worked-out journal columns', () => {
  beforeAll(async () => {
    // The newest SCIE list counts, so use the year already loaded (other tests share these tables).
    const [newest] = await db.select({ y: max(journalIndexListings.year) }).from(journalIndexListings).where(eq(journalIndexListings.listName, 'SCIE'));
    await db.insert(journalIndexListings).values({ issn: '77665544', listName: 'SCIE', year: newest?.y ?? 2026 }).onConflictDoNothing();
    await db.insert(journalJcr).values({ issn: '77665544', jifYear: 2025, jif: '5.2', jifQuartile: 'Q1' }).onConflictDoNothing();
    const paper = (doi: string, issn: string) => createRecord(faculty, 'publications', { doi, title: doi, journal: 'J', year: '2025', issn }, 'draft');
    await paper('10.5555/in-scie', '7766-5544');
    await paper('10.5555/nowhere', '1111-2222');
  });

  it('filters by indexing, JIF quartile and Impact Factor', async () => {
    expect(await names(faculty, 'publications', view(c('indexes', 'hasAnyOf', ['SCIE'])))).toEqual(['10.5555/in-scie']);
    expect(await names(faculty, 'publications', view(c('indexes', 'hasNoneOf', ['SCIE'])))).toEqual(['10.5555/nowhere']);
    expect(await names(faculty, 'publications', view(c('jifQuartile', 'isAnyOf', ['Q1'])))).toEqual(['10.5555/in-scie']);
    expect(await names(faculty, 'publications', view(c('jifQuartile', 'isAnyOf', ['NA'])))).toEqual(['10.5555/nowhere']);
    expect(await names(faculty, 'publications', view(c('jif', 'gte', ['5'])))).toEqual(['10.5555/in-scie']);
    expect(await names(faculty, 'publications', view(c('jif', 'isEmpty')))).toEqual(['10.5555/nowhere']);
  });

  it('mixes worked-out and stored conditions with or', async () => {
    const v: ViewState = { ...view(), filter: { join: 'or', items: [c('indexes', 'hasAnyOf', ['SCIE']), c('doi', 'contains', ['nowhere'])] } };
    expect(await names(faculty, 'publications', v)).toEqual(['10.5555/in-scie', '10.5555/nowhere']);
  });
});

afterAll(async () => {
  await db.delete(journalIndexListings).where(eq(journalIndexListings.issn, '77665544'));
  await db.delete(journalJcr).where(eq(journalJcr.issn, '77665544'));
});

describe('export', () => {
  it('holds exactly the rows and columns of the view, as CSV', async () => {
    const v: ViewState = { ...view(c('stature', 'is', ['National'])), cols: ['name', 'amount', 'validUntil'], sort: [{ field: 'amount', dir: 'asc' }], groupBy: null };
    const data = await exportRows(faculty, 'fellowships', { view: v }, 10_000);
    const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(toCsv(getModule('fellowships')!, data));
    expect(csv.charCodeAt(0)).toBe(0xfeff);                  // the byte-order mark Excel needs for accents
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('"S. No.","Entered by","Department","Status","Year","Name of the national/ international fellowship/financial support /international travel grant","Financial support (amount in INR)","Valid until"');
    expect(lines).toHaveLength(1 + 3);                       // the three National records of this person
    expect(lines[1]).toContain('"\'=HYPERLINK');             // 1000, the smallest: a formula is made plain text
    expect(csv).not.toContain('Colleague');
    expect(csv).toContain('Lifetime');
  });

  it('writes an Excel file with a sheet saying what the filter was', async () => {
    const v = view(c('amount', 'gt', ['25000']));
    const data = await exportRows(faculty, 'fellowships', { view: v }, 10_000);
    const bytes = await toXlsx(getModule('fellowships')!, data, faculty.name, new Date('2026-10-30T10:00:00Z'));
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Fellowships & Travel Grants', 'About this export']);
    expect(wb.worksheets[0]!.rowCount).toBe(1 + 2);
    let about = '';
    wb.getWorksheet('About this export')!.eachRow((r) => { about += ` ${r.getCell(2).text}`; });
    expect(about).toContain('> 25000');
    expect(about).toContain(faculty.name);
  });

  it('stops at the limit and says so', async () => {
    const data = await exportRows(faculty, 'fellowships', {}, 2);
    expect(data.rows).toHaveLength(2);
    expect(data.truncated).toBe(true);
  });
});

describe('saved views', () => {
  const mine = view(c('stature', 'is', ['International']));

  it('keeps a person’s own views to them and IQAC’s shared views for everyone', async () => {
    const p = await createSavedView(faculty, 'fellowships', { name: 'International', view: mine, shared: false });
    const s = await createSavedView(admin, 'fellowships', { name: 'All international', view: mine, shared: true });
    expect((await listSavedViews(faculty, 'fellowships')).map((v) => v.name)).toEqual(['International', 'All international']);   // their own first
    expect((await listSavedViews(colleague, 'fellowships')).map((v) => v.name)).toEqual(['All international']);
    expect((await listSavedViews(faculty, 'fellowships')).find((v) => v.id === s.id)!.mine).toBe(false);
    expect((await listSavedViews(admin, 'fellowships')).find((v) => v.id === s.id)!.mine).toBe(true);
    expect((await listSavedViews(faculty, 'fellowships')).find((v) => v.id === p.id)!.view.filter.items).toHaveLength(1);
  });

  it('refuses a shared view from anyone but IQAC, an empty view, and someone else’s delete', async () => {
    await expect(createSavedView(faculty, 'fellowships', { name: 'Everyone', view: mine, shared: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(createSavedView(faculty, 'fellowships', { name: 'Nothing', view: {}, shared: false })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(createSavedView(faculty, 'fellowships', { name: '  ', view: mine, shared: false })).rejects.toMatchObject({ code: 'VALIDATION' });
    const [shared] = (await listSavedViews(colleague, 'fellowships'));
    await expect(deleteSavedView(colleague, 'fellowships', shared!.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await deleteSavedView(admin, 'fellowships', shared!.id);
    expect((await listSavedViews(colleague, 'fellowships'))).toEqual([]);
  });
});
