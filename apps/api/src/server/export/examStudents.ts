import type ExcelJS from 'exceljs';

/*
 * CDC's report of students who qualified in competitive exams (NAAC 5.2.1), in DARP's own layout. IQAC's
 * original sheet repeated each student's name under every exam column and had one registration number per
 * row, so a student who qualified twice could not be counted once. This one has a row for each STUDENT:
 * the name, the roll number, the exams they qualified in and how many, with the totals worked out below.
 */

export interface ExamEntry { name: string; rollNo: string; regNo: string; exam: string; year: number }

export interface ExamStudent {
  name: string;
  rollNo: string;
  regNos: string[];
  /** Each exam they qualified in, with its year; one exam in two years is two. */
  exams: Array<{ exam: string; year: number }>;
}

/** The order IQAC's sheet listed the exams in; any other exam follows, alphabetically. */
const EXAM_ORDER = [
  'NET', 'SLET', 'GATE', 'GMAT', 'CAT', 'GRE', 'JAM', 'IELET', 'TOEFL', 'Civil Services', 'State government examinations',
];
const examRank = (e: string) => { const i = EXAM_ORDER.indexOf(e); return i < 0 ? EXAM_ORDER.length : i; };
const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Puts the entries together by student. One student is one college roll number: entries that share it are
 * one row. An entry with no roll number cannot be told from another student, so it stays a row of its own
 * (CDC adds the roll number to join it). The same exam in the same year is counted once.
 */
export function studentsOf(entries: ExamEntry[]): ExamStudent[] {
  const byKey = new Map<string, ExamStudent>();
  entries.forEach((e, i) => {
    const key = compact(e.rollNo) ? `roll:${compact(e.rollNo)}` : `entry:${i}`;
    const s = byKey.get(key) ?? { name: e.name, rollNo: e.rollNo, regNos: [], exams: [] };
    if (!s.name) s.name = e.name;
    if (!s.rollNo) s.rollNo = e.rollNo;
    if (e.regNo && !s.regNos.some((r) => compact(r) === compact(e.regNo))) s.regNos.push(e.regNo);
    if (!s.exams.some((x) => x.exam === e.exam && x.year === e.year)) s.exams.push({ exam: e.exam, year: e.year });
    byKey.set(key, s);
  });
  const out = [...byKey.values()];
  for (const s of out) s.exams.sort((a, b) => a.year - b.year || examRank(a.exam) - examRank(b.exam) || a.exam.localeCompare(b.exam));
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

export function totalsOf(students: ExamStudent[]): ExamTotals {
  const per = new Map<string, number>();
  for (const s of students) for (const exam of new Set(s.exams.map((x) => x.exam))) per.set(exam, (per.get(exam) ?? 0) + 1);
  return {
    students: students.length,
    qualifications: students.reduce((n, s) => n + s.exams.length, 0),
    perExam: [...per.entries()].map(([exam, n]) => ({ exam, students: n }))
      .sort((a, b) => examRank(a.exam) - examRank(b.exam) || a.exam.localeCompare(b.exam)),
  };
}

const HEADERS = ['Sl. No.', 'Name of the student', 'College roll number', 'Exam registration number(s)', 'Exams qualified in', 'Number of exams qualified'];

/** Writes the sheet and returns the number of students on it. */
export function writeExamStudents(wb: ExcelJS.Workbook, entries: ExamEntry[], range?: { from: number; to: number }): { sheet: ExcelJS.Worksheet; students: number } {
  const students = studentsOf(entries);
  const totals = totalsOf(students);
  const sheet = wb.addWorksheet('5.2.1 Students');

  const years = range ? (range.from === range.to ? ` (${range.from})` : ` (${range.from} to ${range.to})`) : '';
  sheet.addRow([`5.2.1 Students qualifying in state / national / international level examinations${years}`]).font = { bold: true, size: 12 };
  sheet.addRow(['One row for each student. An individual university’s own entrance examination is not included.']).font = { italic: true };
  sheet.addRow([]);
  const head = sheet.addRow(HEADERS);
  head.font = { bold: true };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.eachCell((c) => { c.border = { bottom: { style: 'thin' } }; });
  students.forEach((s, i) => {
    sheet.addRow([i + 1, s.name, s.rollNo, s.regNos.join(', '), s.exams.map((x) => `${x.exam} ${x.year}`).join('; '), s.exams.length]);
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

  [8, 34, 22, 30, 52, 14].forEach((w, i) => { sheet.getColumn(i + 1).width = w; });
  sheet.getColumn(6).alignment = { horizontal: 'right' };
  sheet.views = [{ state: 'frozen', ySplit: 4 }];
  return { sheet, students: students.length };
}

