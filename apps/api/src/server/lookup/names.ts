import type { Person } from './types';

const TITLES = /\b(dr|prof|professor|mr|mrs|ms|miss|shri|smt|sri|er)\b\.?/g;

function tokens(s: string): string[] {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(TITLES, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Does an account name ("Dr A. K. Verma") name the same person as a published author
 * ({given:'Anil Kumar', family:'Verma'})? Rule: same surname, and the same first initial when
 * both sides have one. Deliberately strict: a wrong "no" only sends the record to a human.
 */
export function namesMatch(accountName: string, p: Pick<Person, 'given' | 'family' | 'full'>): boolean {
  const o = tokens(accountName);
  if (o.length === 0) return false;
  const oSurname = o[o.length - 1]!;
  const oFirst = o.length > 1 ? o[0]![0] : undefined;

  const fam = tokens(p.family);
  let surname: string | undefined;
  let first: string | undefined;
  if (fam.length > 0) {
    surname = fam[fam.length - 1];
    first = tokens(p.given)[0]?.[0];
  } else {
    const all = tokens(p.full);
    surname = all[all.length - 1];
    first = all.length > 1 ? all[0]![0] : undefined;
  }
  if (!surname || surname !== oSurname) return false;
  if (!oFirst || !first) return true;
  return oFirst === first;
}

/** BIT Mesra (any campus), not BITS Pilani. ROR id from OpenAlex, verified 2026-10-06. */
export const BIT_ROR = '028vtqb15';

export function isBitAffiliation(name: string, rorIds: string[] = []): boolean {
  if (rorIds.some((id) => id.endsWith(BIT_ROR))) return true;
  return /birla institute of technology(?!\s*(and|&)\s*science)/i.test(name);
}
