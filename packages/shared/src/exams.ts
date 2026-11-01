/*
 * A student who qualified in a competitive exam can be entered twice: by CDC (Students Qualifying
 * Competitive Exams) and by the faculty member who guided them (Students Guided). One student, one exam,
 * one year is one row. These are the keys two entries are compared by.
 */

const norm = (s: unknown): string => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface ExamEntry {
  /** The number the exam gave (its registration or roll number). */
  regNo?: string;
  /** The student's college roll number. */
  rollNo?: string;
  exam: string;
  year: number;
}

/**
 * The keys an entry can be recognised by: the exam's own number, and the college roll number, each
 * together with the exam and the year. A number that is empty makes no key, so two students with no
 * number are never taken for one. Two entries are the same student when any key is shared.
 */
export function examKeys(e: ExamEntry): string[] {
  return [e.regNo, e.rollNo].map(norm).filter(Boolean).map((n) => `${n}|${norm(e.exam)}|${e.year}`);
}

/** Entries from several sources in order of trust: one that shares a key with an earlier one is dropped. */
export function withoutRepeats<T>(entries: T[], keysOf: (e: T) => string[]): { kept: T[]; dropped: T[] } {
  const seen = new Set<string>();
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const e of entries) {
    const keys = keysOf(e);
    if (keys.some((k) => seen.has(k))) { dropped.push(e); continue; }
    keys.forEach((k) => seen.add(k));
    kept.push(e);
  }
  return { kept, dropped };
}
