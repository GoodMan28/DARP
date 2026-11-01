import { and, between, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { records, users, departments } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { mustGetModule, ServiceError } from './service';
import { scopeFilter } from './scope';
import { isOutsideBit } from '@darp/shared/affiliation';
import { examKeys, withoutRepeats } from '@darp/shared/exams';

/*
 * Students who qualified in a competitive exam, as the faculty member who guided them entered them in
 * Students Guided (status after passing: "Competitive exams"). CDC's own list of the same students is
 * the Students Qualifying Competitive Exams module; its report holds both, once each. Read when the
 * report or the screen is made, never copied: a correction by the guide shows at once, and CDC's own
 * entry always stands where both exist.
 *
 * CDC is not a viewer of Students Guided. This is the one narrow exception, and it reads only the five
 * fields below (jsonb_build_object, so nothing else leaves the database): never the student's e-mail,
 * phone, pay package or any file. It reads every guide's entries, so it is open only to CDC and IQAC,
 * and it does not use scopeFilter (that would show only each guide's own): the conditions below are the
 * module, "not deleted", and approved or verified.
 */

export interface FacultyExam {
  year: number;
  examName: string;
  studentName: string;
  /** The exam's own registration number (what the guide recorded for it). */
  registrationNo: string;
  /** The student's college roll number. */
  rollNo: string;
  guide: string;
  department: string;
}

const text = (v: unknown) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

/** Who may read other people's Students Guided entries for this: CDC and IQAC only. */
export const mayReadFacultyExams = (actor: SessionUser) => actor.role === 'cdc' || actor.role === 'admin';

/** Students guided who went on to a competitive exam, for the years given (all years when none). */
export interface ExamFilter { from: number; to: number; departmentIds?: string[] }

export async function facultyExamEntries(actor: SessionUser, filter?: ExamFilter): Promise<FacultyExam[]> {
  if (!mayReadFacultyExams(actor)) throw new ServiceError('FORBIDDEN', 'Only CDC and IQAC may see this.');
  return readFacultyExams(filter);
}

/** The same, for the report writer, which has already checked who is asking. */
export async function readFacultyExams(filter?: ExamFilter): Promise<FacultyExam[]> {
  const m = mustGetModule('studentsguided');   // for its "done at BIT?" answer
  const picked = sql<Record<string, unknown>>`jsonb_build_object(
    'studentName', ${records.data} -> 'studentName', 'rollNo', ${records.data} -> 'rollNo', 'examGiven', ${records.data} -> 'examGiven',
    'examRegistrationNo', ${records.data} -> 'examRegistrationNo', 'yearOfPassing', ${records.data} -> 'yearOfPassing',
    'affiliatedToBit', ${records.data} -> 'affiliatedToBit')`;
  const rows = await db.select({ d: picked, guide: users.name, department: departments.name }).from(records)
    .innerJoin(users, eq(users.id, records.ownerUserId))
    .leftJoin(departments, eq(departments.id, records.departmentId))
    .where(and(
      eq(records.moduleKey, 'studentsguided'), isNull(records.deletedAt),
      inArray(records.status, ['verified', 'approved']),
      sql`${records.data} ->> 'statusAfterPassing' = 'Competitive exams'`,
      ...(filter ? [between(records.periodYear, filter.from, filter.to)] : []),
      ...(filter?.departmentIds?.length ? [inArray(records.departmentId, filter.departmentIds)] : []),
    ))
    .orderBy(records.periodYear, records.createdAt);
  return rows
    .filter((r) => !isOutsideBit(m, r.d))
    .map((r) => ({
      year: Number(r.d.yearOfPassing), examName: text(r.d.examGiven), studentName: text(r.d.studentName),
      registrationNo: text(r.d.examRegistrationNo), rollNo: text(r.d.rollNo), guide: r.guide, department: r.department ?? '',
    }))
    .filter((e) => Number.isFinite(e.year) && e.examName !== '' && e.studentName !== '');
}

export interface CdcExam { year: number; examName: string; registrationNo: string; rollNo: string }

/**
 * The faculty entries that CDC's list does not already hold. CDC's own come first and always stand; two
 * guides who entered one student leave one row. Matched by the exam's own number first, then the college
 * roll number, always with the same exam in the same year.
 */
export function newFromFaculty(cdc: CdcExam[], faculty: FacultyExam[]): { rows: FacultyExam[]; repeats: number } {
  type Entry = { from: 'cdc' | 'faculty'; e: FacultyExam | null; cdc: CdcExam | null };
  const all: Entry[] = [
    ...cdc.map((c) => ({ from: 'cdc' as const, e: null, cdc: c })),
    ...faculty.map((f) => ({ from: 'faculty' as const, e: f, cdc: null })),
  ];
  const keysOf = (x: Entry) => {
    const exam = x.cdc?.examName ?? x.e!.examName;
    const year = x.cdc?.year ?? x.e!.year;
    return examKeys({ regNo: x.cdc?.registrationNo ?? x.e!.registrationNo, rollNo: x.cdc?.rollNo ?? x.e!.rollNo, exam, year });
  };
  const { kept, dropped } = withoutRepeats(all, keysOf);
  return { rows: kept.filter((x) => x.from === 'faculty').map((x) => x.e!), repeats: dropped.filter((x) => x.from === 'faculty').length };
}

/**
 * What the screen shows CDC: the students guides entered who are not in CDC's own list, and how many
 * repeats were left out. CDC's own entries are read through the module's scope as usual.
 */
export async function facultyExamsNotInList(actor: SessionUser): Promise<{ rows: FacultyExam[]; repeats: number }> {
  const faculty = await facultyExamEntries(actor);
  const cdcRows = await db.select({ data: records.data }).from(records)
    .where(and(scopeFilter(actor, mustGetModule('exams')), inArray(records.status, ['verified', 'approved'])));
  const cdc = cdcRows.map((r) => {
    const d = r.data as Record<string, unknown>;
    return { year: Number(d.year), examName: text(d.examName), registrationNo: text(d.registrationNo), rollNo: text(d.rollNo) };
  });
  return newFromFaculty(cdc, faculty);
}
