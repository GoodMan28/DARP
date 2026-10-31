import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type ExcelJS from 'exceljs';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { createRecord } from '@/server/records/service';
import {
  readReportRequest, summariseReport, generateReport, reportOptions,
} from '@/server/export/reports';
import type { SessionUser } from '@/server/auth/session';

/* Phase 7: reports by year range, year type, department and format. */

let cse: SessionUser;
let me: SessionUser;
let hodCse: SessionUser;
let drie: SessionUser;
let cdc: SessionUser;
let admin: SessionUser;

const q = (params: Record<string, string>) => new URLSearchParams(params);
const rowsOf = (s: Awaited<ReturnType<typeof summariseReport>>, moduleKey: string) =>
  s.sheets.find((x) => x.moduleKey === moduleKey)?.rows ?? 0;

/** A sheet's rows below its headings row (the row holding `heading`, else row 1), keyed by heading. */
function table(ws: ExcelJS.Worksheet, heading?: string): Array<Record<string, string>> {
  // Text, not values: a heading in IQAC's format file may be rich text.
  const texts = (row: ExcelJS.Row) => { const t: string[] = []; row.eachCell((c, col) => { t[col] = c.text.replace(/\s+/g, ' ').trim(); }); return t; };
  let at = 1;
  if (heading) ws.eachRow((row, n) => { if (at === 1 && texts(row).some((v) => v?.startsWith(heading))) at = n; });
  const headers = texts(ws.getRow(at));
  const out: Array<Record<string, string>> = [];
  ws.eachRow((row, n) => {
    if (n <= at) return;
    const r: Record<string, string> = {};
    row.eachCell((c, col) => { r[headers[col] ?? String(col)] = c.text; });
    out.push(r);
  });
  return out;
}

const fellowship = (name: string, awardDate: string) => ({
  supportType: 'National fellowship', name, amount: '50000', purpose: 'Research visit', stature: 'National',
  agency: 'DST', awardDate, validityYears: '2',
});

beforeAll(async () => {
  await truncateAll();
  cse = await makeUser({ role: 'faculty', dept: 'CSE' });
  me = await makeUser({ role: 'faculty', dept: 'ME' });
  hodCse = await makeUser({ role: 'hod', dept: 'CSE' });
  drie = await makeUser({ role: 'drie' });
  cdc = await makeUser({ role: 'cdc' });
  admin = await makeUser({ role: 'admin' });

  // 10 Feb 2022: calendar year 2022, but financial year 2021-22.
  await createRecord(cse, 'fellowships', fellowship('INSA visiting', '2022-02-10'), 'submit');
  await createRecord(me, 'fellowships', fellowship('ME fellowship', '2024-06-01'), 'submit');
  await createRecord(cse, 'awards', {
    awardDate: '2024-03-15', awardName: 'Best teacher', level: 'National', agency: 'AICTE', validityYears: '3',
  }, 'submit');
  await createRecord(cse, 'awards', { awardDate: '2024-05-01', awardName: 'Draft only', level: 'State', agency: 'X' }, 'draft');
  // A year alone (academic year 2023-24): no calendar or financial year of its own.
  await createRecord(cdc, 'exams', { year: '2023', examName: 'GATE', studentName: 'R. Kumar', registrationNo: 'G-1' }, 'submit');
});

afterAll(async () => { await closeDb(); });

describe('years and year types', () => {
  it('reads each sheet in its own year type unless one type is asked for', async () => {
    const fy2021 = await summariseReport(admin, readReportRequest(admin, 'full', q({ from: '2021', to: '2021' })));
    expect(rowsOf(fy2021, 'fellowships')).toBe(1);            // FY 2021-22
    const cy2022 = await summariseReport(admin, readReportRequest(admin, 'full', q({ from: '2022', to: '2022', yearType: 'CY' })));
    expect(rowsOf(cy2022, 'fellowships')).toBe(1);            // calendar 2022
    const fy2022 = await summariseReport(admin, readReportRequest(admin, 'full', q({ from: '2022', to: '2022' })));
    expect(rowsOf(fy2022, 'fellowships')).toBe(0);
  });

  it('leaves out a record dated by year alone from another year type, rather than guess', async () => {
    const auto = await summariseReport(admin, readReportRequest(admin, 'full', q({ from: '2023', to: '2023' })));
    expect(rowsOf(auto, 'exams')).toBe(1);
    const cy = await summariseReport(admin, readReportRequest(admin, 'full', q({ from: '2023', to: '2023', yearType: 'CY' })));
    expect(rowsOf(cy, 'exams')).toBe(0);
  });

  it('counts approved records only, and filters by department', async () => {
    const all = await summariseReport(admin, readReportRequest(admin, 'full', q({ from: '2020', to: '2025' })));
    expect(rowsOf(all, 'awards')).toBe(1);                     // the draft is not in it
    expect(rowsOf(all, 'fellowships')).toBe(2);
    const onlyMe = await summariseReport(admin, readReportRequest(admin, 'full', q({ from: '2020', to: '2025', departments: me.departmentId! })));
    expect(rowsOf(onlyMe, 'fellowships')).toBe(1);
    expect(rowsOf(onlyMe, 'awards')).toBe(0);
  });
});

describe('who may download what', () => {
  it('keeps a head of department to their own department, whatever is asked', async () => {
    const r = readReportRequest(hodCse, 'full', q({ from: '2020', to: '2025', departments: me.departmentId! }));
    expect(r.departmentIds).toEqual([hodCse.departmentId]);
    const s = await summariseReport(hodCse, r);
    expect(rowsOf(s, 'fellowships')).toBe(1);                  // CSE's, not ME's
    const opts = await reportOptions(hodCse);
    expect(opts.departmentFixed).toBe(true);
    expect(opts.departments.map((d) => d.id)).toEqual([hodCse.departmentId]);
    expect(opts.workbooks.map((w) => w.key)).toEqual(['hod', 'faculty']);
  });

  it('gives an office its own workbooks and modules only', async () => {
    expect(() => readReportRequest(drie, 'naac', q({ workbook: 'dofa', from: '2022', to: '2024' }))).toThrow(/not yours/);
    const opts = await reportOptions(drie);
    expect(opts.workbooks.map((w) => w.key)).toEqual(['drie', 'faculty']);
    expect(opts.modules.map((m) => m.key)).toContain('fellowships');
    expect(opts.modules.map((m) => m.key)).not.toContain('exams');
    // A module outside the office is dropped from a Full data request.
    expect(readReportRequest(drie, 'full', q({ from: '2022', to: '2024', modules: 'exams,fellowships' })).moduleKeys).toEqual(['fellowships']);
  });

  it('refuses unmasked personal data to anyone but IQAC, and a format not yet provided', async () => {
    expect(() => readReportRequest(drie, 'naac', q({ workbook: 'drie', from: '2022', to: '2024', includePii: '1', reason: 'For the NAAC peer team' })))
      .toThrow(/only IQAC/);
    expect(() => readReportRequest(admin, 'nirf', q({ from: '2022', to: '2024' }))).toThrow(/not been provided/);
  });

  it('gives a faculty member their own Faculty workbook, with their own records only', async () => {
    const opts = await reportOptions(cse);
    expect(opts.workbooks.map((w) => w.key)).toEqual(['faculty']);
    expect(opts.scope).toBe('self');
    expect(() => readReportRequest(cse, 'naac', q({ workbook: 'drie', from: '2020', to: '2025' }))).toThrow(/not yours/);
    const r = readReportRequest(cse, 'naac', q({ workbook: 'faculty', from: '2020', to: '2025', departments: me.departmentId! }));
    expect(r.departmentIds).toBeNull();
    const s = await summariseReport(cse, r);
    expect(rowsOf(s, 'fellowships')).toBe(1);                  // their own, not ME's
  });
});

describe('the workbook', () => {
  it('writes Full data with the year in the asked type, real dates and the worked-out columns', async () => {
    const r = readReportRequest(admin, 'full', q({ from: '2021', to: '2024', modules: 'fellowships,awards' }));
    const { workbook, fileName } = await generateReport(admin, r, []);
    expect(fileName).toMatch(/^DARP-full-data-2021-2024-/);
    expect(workbook.worksheets.map((w) => w.name).sort()).toEqual(['About this report', 'Awards & Recognition', 'Fellowships & Travel Grants']);

    const fellows = table(workbook.getWorksheet('Fellowships & Travel Grants')!);
    const insa = fellows.find((f) => f['Name of the national/ international fellowship/financial support /international travel grant'] === 'INSA visiting')!;
    expect(insa.Year).toBe('FY 2021-22');
    expect(insa['Date of award']).toBe('2022-02-10');         // the date itself, not a year
    expect(insa['Valid until']).toBe('09-02-2024 (expired)');
    const about = table(workbook.getWorksheet('About this report')!);
    expect(JSON.stringify(about)).toContain('FY 2021-22 to FY 2024-25');
  });

  it('writes a NAAC workbook in its own wording, for the chosen years', async () => {
    const r = readReportRequest(drie, 'naac', q({ workbook: 'drie', from: '2021', to: '2021' }));
    const { workbook, rowsWritten } = await generateReport(drie, r, []);
    expect(rowsWritten).toBe(1);                               // the FY 2021-22 fellowship
    const sheet = table(workbook.getWorksheet('Fellowship')!, 'Name of the teacher');
    expect(sheet[0]!['Year of Award (Financial year)']).toBe('2021');
    expect(sheet[0]!['Valid for life']).toBe('No');
    // DARP's own columns sit to the right of the format's.
    expect(sheet[0]!['Valid until']).toBe('09-02-2024 (expired)');
  });

  it('fills IQAC’s own format: its years, its Profile form, and only the sheets the office looks after', async () => {
    const dofa = await makeUser({ role: 'dofa' });
    await createRecord(cse, 'profile', {
      name: cse.name, pan: 'ABCDE1234F', aadhaar: '234123412346', designation: 'Professor', natureOfAssociation: 'Regular',
      ugQualification: 'B.E./B.Tech', ugInstitution: 'BIT', pgQualification: 'M.E./M.Tech', pgInstitution: 'IIT', hasPhd: 'No',
      hasPostdoc: 'No', highestDegreeDate: '2010-01-01', joiningDate: '2012-07-01', teachingExperienceMonths: '120',
      industryExperienceMonths: '0', teachingHours: '300', researchHours: '200', consultancyHours: '10',
    }, 'submit');
    const r = readReportRequest(dofa, 'naac', q({ workbook: 'faculty', from: '2023', to: '2025' }));
    const { workbook } = await generateReport(dofa, r, []);
    const names = workbook.worksheets.map((w) => w.name);
    // DoFA's sheets of the Faculty format; DRIE's (Publications, Fellowship…) are left out.
    expect(names).toContain('Awards');
    expect(names).toContain('Profile');
    expect(names).not.toContain('Publications');
    expect(names).not.toContain('Fellowship');

    // The format's years ("data for 2024, 2023, 2022") become the report's.
    let headings = '';
    workbook.getWorksheet('Awards')!.getRow(2).eachCell((c) => { headings += ` ${c.text}`; });
    expect(headings).toContain('data for 2025, 2024, 2023');
    expect(headings).toContain('Valid until');

    // The Profile form: a person per column, with the figures counted for the report's years.
    const form = workbook.getWorksheet('Profile')!;
    const rowOf = (start: string) => {
      let at = 0;
      form.eachRow((row, n) => { if (!at && row.getCell(1).text.startsWith(start)) at = n; });
      return at;
    };
    expect(form.getRow(rowOf('No. of Awards from state, national and international agencies received from')).getCell(1).text).toContain('from 2023-2025');
    // "Last year" is the range's last year that has ended (read in 2026: AY 2025-26).
    expect(form.getRow(rowOf('Number of national seminars attended last year')).getCell(1).text).toMatch(/AY 20\d\d-\d\d/);
    const persons = form.getRow(rowOf('Name')).values as unknown[];
    {
      const col = persons.indexOf(cse.name);
      expect(col).toBeGreaterThan(1);
      expect(form.getRow(rowOf('No. of Awards from state, national and international agencies received from')).getCell(col).value).toBe(1);
    }
  });
});
