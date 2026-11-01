import type ExcelJS from 'exceljs';

/*
 * CDC's report of students who qualified in competitive exams (NAAC 5.2.1), in DARP's own layout. IQAC's
 * original sheet repeated each student's name under every exam column and had one registration number per
 * row, so a student who qualified twice could not be counted once. This one has two tabs:
 *  - "5.2.1 Students": a row for each STUDENT, with the exams they qualified in, how many, and the totals;
 *  - "By year": the same data year by year, with each year's totals.
 * Lists inside a cell are separated by "; " everywhere, and each registration number stands in the same
 * place as the exam it belongs to.
 */

export interface ExamEntry { name: string; rollNo: string; regNo: string; exam: string; year: number }

export interface StudentExam {
  exam: string;
  year: number;
  /** The exam's own registration number(s); more than one only if the same exam and year was entered twice. */
  regNos: string[];
}

export interface ExamStudent {
  name: string;
  rollNo: string;
  /** Each exam they qualified in, with its year; one exam in two years is two. */
  exams: StudentExam[];
}

/** What separates the items of a list inside one cell. */
export const LIST_SEPARATOR = '; ';
/** Written where an exam has no registration number, so the numbers still line up with the exams. */
const NO_NUMBER = '—';

/** The order IQAC's sheet listed the exams in; any other exam follows, alphabetically. */
const EXAM_ORDER = [
  'NET', 'SLET', 'GATE', 'GMAT', 'CAT', 'GRE', 'JAM', 'IELET', 'TOEFL', 'Civil Services', 'State government examinations',
];
const examRank = (e: string) => { const i = EXAM_ORDER.indexOf(e); return i < 0 ? EXAM_ORDER.length : i; };
const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const byExam = (a: string, b: string) => examRank(a) - examRank(b) || a.localeCompare(b);

/**
 * Puts the entries together by student. One student is one college roll number: entries that share it are
 * one row. An entry with no roll number cannot be told from another student, so it stays a row of its own
 * (CDC adds the roll number to join it). The same exam in the same year is counted once.
 */
export function studentsOf(entries: ExamEntry[]): ExamStudent[] {
  const byKey = new Map<string, ExamStudent>();
  entries.forEach((e, i) => {
    const key = compact(e.rollNo) ? `roll:${compact(e.rollNo)}` : `entry:${i}`;
    const s = byKey.get(key) ?? { name: e.name, rollNo: e.rollNo, exams: [] };
    if (!s.name) s.name = e.name;
    if (!s.rollNo) s.rollNo = e.rollNo;
    let x = s.exams.find((t) => t.exam === e.exam && t.year === e.year);
    if (!x) { x = { exam: e.exam, year: e.year, regNos: [] }; s.exams.push(x); }
    if (e.regNo && !x.regNos.some((r) => compact(r) === compact(e.regNo))) x.regNos.push(e.regNo);
    byKey.set(key, s);
  });
  const out = [...byKey.values()];
  for (const s of out) s.exams.sort((a, b) => a.year - b.year || byExam(a.exam, b.exam));
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export interface ExamTotals {
  /** Students who qualified in at least one exam. */
  students: number;
  /** Qualifications: a student counts once for each exam and year. */
  qualifications: number;
  /** For each exam, how many students qualified in it (a student counts once for an exam, whatever the year). */
  perExam: Array<{ exam: string; students: number }>;
}

function totalsFrom(rows: Array<{ exams: Array<{ exam: string }> }>): ExamTotals {
  const per = new Map<string, number>();
  for (const s of rows) for (const exam of new Set(s.exams.map((x) => x.exam))) per.set(exam, (per.get(exam) ?? 0) + 1);
  return {
    students: rows.length,
    qualifications: rows.reduce((n, s) => n + s.exams.length, 0),
    perExam: [...per.entries()].map(([exam, n]) => ({ exam, students: n })).sort((a, b) => byExam(a.exam, b.exam)),
  };
}

export const totalsOf = (students: ExamStudent[]): ExamTotals => totalsFrom(students);

/** The same students, year by year: in each year, those who qualified in it and only their exams of that year. */
export function yearsOf(students: ExamStudent[]): Array<{ year: number; students: ExamStudent[]; totals: ExamTotals }> {
  const years = [...new Set(students.flatMap((s) => s.exams.map((x) => x.year)))].sort((a, b) => a - b);
  return years.map((year) => {
    const inYear = students
      .map((s) => ({ ...s, exams: s.exams.filter((x) => x.year === year) }))
      .filter((s) => s.exams.length > 0);
    return { year, students: inYear, totals: totalsFrom(inYear) };
  });
}

const regNumbersOf = (exams: StudentExam[]) => exams.map((x) => x.regNos.join(' / ') || NO_NUMBER).join(LIST_SEPARATOR);
const rangeText = (range?: { from: number; to: number }) => (range ? (range.from === range.to ? ` (${range.from})` : ` (${range.from} to ${range.to})`) : '');

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.eachCell((c) => { c.border = { bottom: { style: 'thin' } }; });
}

const MAIN_HEADERS = ['Sl. No.', 'Name of the student', 'College roll number', 'Exam registration number(s)', 'Exams qualified in', 'Number of exams qualified'];

/** Writes the two tabs and returns the number of students on the first. */
export function writeExamStudents(wb: ExcelJS.Workbook, entries: ExamEntry[], range?: { from: number; to: number }): { sheet: ExcelJS.Worksheet; students: number } {
  const students = studentsOf(entries);
  const totals = totalsOf(students);
  const sheet = wb.addWorksheet('5.2.1 Students');

  sheet.addRow([`5.2.1 Students qualifying in state / national / international level examinations${rangeText(range)}`]).font = { bold: true, size: 12 };
  sheet.addRow(['One row for each student. An individual university’s own entrance examination is not included. Several items in one cell are separated by ";", and each registration number is in the place of its exam.']).font = { italic: true };
  sheet.addRow([]);
  styleHeader(sheet.addRow(MAIN_HEADERS));
  students.forEach((s, i) => {
    sheet.addRow([i + 1, s.name, s.rollNo, regNumbersOf(s.exams), s.exams.map((x) => `${x.exam} ${x.year}`).join(LIST_SEPARATOR), s.exams.length]);
  });

  sheet.addRow([]);
  const line = (label: string, value: number) => {
    const r = sheet.addRow(['', label, '', '', '', value]);
    r.getCell(2).font = { bold: true };
    r.getCell(6).font = { bold: true };
  };
  line('Total number of students who qualified', totals.students);
  line('Total number of qualifications (a student counts once for each exam)', totals.qualifications);
  sheet.addRow([]);
  sheet.addRow(['', 'Students who qualified, by exam', '', '', '', 'Students']).font = { bold: true };
  for (const p of totals.perExam) sheet.addRow(['', p.exam, '', '', '', p.students]);
  [8, 34, 22, 40, 52, 14].forEach((w, i) => { sheet.getColumn(i + 1).width = w; });
  sheet.getColumn(6).alignment = { horizontal: 'right' };
  sheet.views = [{ state: 'frozen', ySplit: 4 }];

  writeByYear(wb, students, totals, range);
  return { sheet, students: students.length };
}

/** "By year": one table of each year's totals, then each year's students. */
function writeByYear(wb: ExcelJS.Workbook, students: ExamStudent[], totals: ExamTotals, range?: { from: number; to: number }) {
  const sheet = wb.addWorksheet('By year');
  const years = yearsOf(students);
  const exams = totals.perExam.map((p) => p.exam);

  sheet.addRow([`5.2.1 Students qualifying in examinations, year by year${rangeText(range)}`]).font = { bold: true, size: 12 };
  sheet.addRow(['A student who qualified in two years is counted in each year, and once in "All years". Several items in one cell are separated by ";".']).font = { italic: true };
  sheet.addRow([]);
  styleHeader(sheet.addRow(['Year', 'Students who qualified', 'Qualifications', ...exams]));
  const count = (t: ExamTotals, exam: string) => t.perExam.find((p) => p.exam === exam)?.students ?? 0;
  for (const y of years) sheet.addRow([y.year, y.totals.students, y.totals.qualifications, ...exams.map((e) => count(y.totals, e))]);
  const all = sheet.addRow(['All years', totals.students, totals.qualifications, ...exams.map((e) => count(totals, e))]);
  all.font = { bold: true };
  all.eachCell((c) => { c.border = { top: { style: 'thin' } }; });

  for (const y of years) {
    sheet.addRow([]);
    sheet.addRow([`${y.year}: ${y.totals.students} ${y.totals.students === 1 ? 'student' : 'students'}, ${y.totals.qualifications} ${y.totals.qualifications === 1 ? 'qualification' : 'qualifications'}`]).font = { bold: true, size: 11 };
    styleHeader(sheet.addRow(['Sl. No.', 'Name of the student', 'College roll number', 'Exam registration number(s)', 'Exams qualified in', 'Number of exams qualified']));
    y.students.forEach((s, i) => {
      sheet.addRow([i + 1, s.name, s.rollNo, regNumbersOf(s.exams), s.exams.map((x) => x.exam).join(LIST_SEPARATOR), s.exams.length]);
    });
  }
  [10, 34, 22, 40, 52, 14].forEach((w, i) => { sheet.getColumn(i + 1).width = w; });
  for (let c = 7; c <= 3 + exams.length; c += 1) sheet.getColumn(c).width = 12;
  sheet.views = [{ state: 'frozen', ySplit: 4 }];
}
