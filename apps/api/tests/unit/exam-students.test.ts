import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { studentsOf, totalsOf, yearsOf, writeExamStudents, type ExamEntry } from '@/server/export/examStudents';
import { rollNumbersFromFaculty } from '@/server/records/examsFromFaculty';

/* CDC's report: a row for each student, the exams they qualified in, and the totals worked out. */

const e = (name: string, rollNo: string, exam: string, year: number, regNo = `${exam}-${name}`): ExamEntry => ({ name, rollNo, regNo, exam, year });

describe('students from exam entries', () => {
  const entries = [
    e('Ravi Kumar', 'BTECH/1/19', 'GATE', 2023, 'G-1'),
    e('Ravi Kumar', 'btech 1 19', 'CAT', 2023, 'C-1'),            // same roll number, written differently
    e('Ravi Kumar', 'BTECH/1/19', 'GATE', 2024, 'G-2'),           // the same exam again, a year later
    e('Asha Rao', 'MTECH/7/20', 'NET', 2023),
    e('Meera N', '', 'JAM', 2023, 'J-1'),                         // no roll number: cannot be joined to anyone
    e('Meera N', '', 'GRE', 2023, 'R-1'),
  ];

  it('is one row for each roll number, with every exam and year, and how many', () => {
    const s = studentsOf(entries);
    const ravi = s.find((x) => x.name === 'Ravi Kumar')!;
    // by year, then IQAC's exam order, each with the registration number of that very exam
    expect(ravi.exams).toEqual([
      { exam: 'GATE', year: 2023, regNos: ['G-1'] }, { exam: 'CAT', year: 2023, regNos: ['C-1'] }, { exam: 'GATE', year: 2024, regNos: ['G-2'] },
    ]);
    expect(s.filter((x) => x.name === 'Ravi Kumar')).toHaveLength(1);
  });

  it('keeps entries without a roll number as separate rows, never guessing they are one student', () => {
    expect(studentsOf(entries).filter((x) => x.name === 'Meera N')).toHaveLength(2);
  });

  it('counts one exam in one year once, however many times it was entered', () => {
    const s = studentsOf([e('A', 'R/1', 'GATE', 2023, 'x'), e('A', 'R/1', 'GATE', 2023, 'y')]);
    expect(s[0]!.exams).toEqual([{ exam: 'GATE', year: 2023, regNos: ['x', 'y'] }]);
  });

  it('works out the totals: students, qualifications, and students for each exam', () => {
    expect(totalsOf(studentsOf(entries))).toEqual({
      students: 4,
      qualifications: 6,                                          // Ravi 3, Asha 1, and one each for the two Meera rows
      perExam: [{ exam: 'NET', students: 1 }, { exam: 'GATE', students: 1 }, { exam: 'CAT', students: 1 }, { exam: 'GRE', students: 1 }, { exam: 'JAM', students: 1 }],
    });
  });
});

describe('the sheet', () => {
  it('has the students, the exams and counts, and the totals below', () => {
    const wb = new ExcelJS.Workbook();
    const { sheet, students } = writeExamStudents(wb, [
      e('Ravi Kumar', 'BTECH/1/19', 'GATE', 2023, 'G-1'), e('Ravi Kumar', 'BTECH/1/19', 'CAT', 2023, 'C-1'), e('Asha Rao', 'MTECH/7/20', 'NET', 2023, 'N-1'),
    ], { from: 2023, to: 2023 });
    expect(students).toBe(2);
    const rows: string[][] = [];
    sheet.eachRow((row) => { const r: string[] = []; row.eachCell({ includeEmpty: true }, (c, col) => { r[col] = c.text; }); rows.push(r); });
    expect(rows[0]![1]).toMatch(/^5\.2\.1 .*\(2023\)$/);
    // (an empty row is skipped when reading, so the heading is the third row)
    expect(rows[2]!.slice(1)).toEqual(['Sl. No.', 'Name of the student', 'College roll number', 'Exam registration number(s)', 'Exams qualified in', 'Number of exams qualified']);
    expect(rows[3]!.slice(1)).toEqual(['1', 'Asha Rao', 'MTECH/7/20', 'N-1', 'NET 2023', '1']);
    // one delimiter for both lists, and each number in the place of its exam
    expect(rows[4]!.slice(1)).toEqual(['2', 'Ravi Kumar', 'BTECH/1/19', 'G-1; C-1', 'GATE 2023; CAT 2023', '2']);
    const flat = rows.map((r) => r.join('|')).join('\n');
    expect(flat).toContain('Total number of students who qualified||||2');
    expect(flat).toContain('Total number of qualifications (a student counts once for each exam)||||3');
    expect(flat).toMatch(/\|NET\|\|\|\|1/);
    expect(flat).toMatch(/\|GATE\|\|\|\|1/);
  });
});

describe('the same students, year by year', () => {
  const entries = [
    e('Ravi Kumar', 'BTECH/1/19', 'GATE', 2023, 'G-1'), e('Ravi Kumar', 'BTECH/1/19', 'CAT', 2023, 'C-1'), e('Ravi Kumar', 'BTECH/1/19', 'GATE', 2024, 'G-2'),
    e('Asha Rao', 'MTECH/7/20', 'NET', 2023, 'N-1'), e('Sam Lakra', 'BTECH/3/21', 'GATE', 2024, 'G-3'),
  ];

  it('gives each year its own students, exams and totals; a student of two years is in both', () => {
    const years = yearsOf(studentsOf(entries));
    expect(years.map((y) => [y.year, y.totals.students, y.totals.qualifications])).toEqual([[2023, 2, 3], [2024, 2, 2]]);
    expect(years[0]!.students.find((s) => s.name === 'Ravi Kumar')!.exams.map((x) => x.exam)).toEqual(['GATE', 'CAT']);
    expect(years[1]!.students.find((s) => s.name === 'Ravi Kumar')!.exams.map((x) => x.exam)).toEqual(['GATE']);       // only that year's
    expect(years[1]!.totals.perExam).toEqual([{ exam: 'GATE', students: 2 }]);
  });

  it('is a second tab: totals for each year and for all years, then each year’s students', () => {
    const wb = new ExcelJS.Workbook();
    writeExamStudents(wb, entries, { from: 2023, to: 2024 });
    expect(wb.worksheets.map((w) => w.name)).toEqual(['5.2.1 Students', 'By year']);
    const rows: string[][] = [];
    wb.getWorksheet('By year')!.eachRow((row) => { const r: string[] = []; row.eachCell({ includeEmpty: true }, (c, col) => { r[col] = c.text; }); rows.push(r); });
    const flat = rows.map((r) => r.slice(1).join('|'));
    expect(flat).toContain('Year|Students who qualified|Qualifications|NET|GATE|CAT');
    expect(flat).toContain('2023|2|3|1|1|1');
    expect(flat).toContain('2024|2|2|0|2|0');
    expect(flat).toContain('All years|3|5|1|2|1');                  // Ravi is one student over both years
    expect(flat).toContain('2023: 2 students, 3 qualifications');
    expect(flat).toContain('1|Asha Rao|MTECH/7/20|N-1|NET|1');
    expect(flat).toContain('2|Ravi Kumar|BTECH/1/19|G-1; C-1|GATE; CAT|2');   // the same delimiter as the first tab
    expect(flat).toContain('2|Sam Lakra|BTECH/3/21|G-3|GATE|1');
  });

  it('writes a dash where an exam has no registration number, so the numbers keep their places', () => {
    const wb = new ExcelJS.Workbook();
    writeExamStudents(wb, [e('Ravi', 'R/1', 'GATE', 2023, ''), e('Ravi', 'R/1', 'CAT', 2023, 'C-1')]);
    const cells: string[] = [];
    wb.getWorksheet('5.2.1 Students')!.eachRow((row) => row.eachCell((c) => cells.push(c.text)));
    expect(cells).toContain('\u2014; C-1');
  });
});

describe('roll numbers from the guide’s entry', () => {
  it('goes onto CDC’s row for the same exam number, so one student is one row', () => {
    const cdc = [
      { year: 2023, examName: 'GATE', registrationNo: 'GATE-0001', rollNo: '' },
      { year: 2023, examName: 'CAT', registrationNo: 'CAT-9', rollNo: '' },
      { year: 2023, examName: 'JAM', registrationNo: 'JAM-1', rollNo: 'HAS/1' },
    ];
    const faculty = [{ year: 2023, examName: 'GATE', studentName: 'Ravi', registrationNo: 'gate 0001', rollNo: 'BTECH/1/19', guide: 'G', department: 'CSE' }];
    expect([...rollNumbersFromFaculty(cdc, faculty)]).toEqual([[0, 'BTECH/1/19']]);          // not the CAT row (no match), not the JAM row (has its own)
  });
});
