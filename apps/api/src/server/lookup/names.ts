import type { Person } from './types';

const TITLES = /\b(dr|prof|professor|mr|mrs|ms|miss|shri|smt|sri|er)\b\.?/g;

function tokens(s: string): string[] {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(TITLES, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Single-letter edits (insert, delete, replace) needed to turn one word into the other. */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * Indian names are routinely transliterated differently from one publication to the next
 * (Bhattacharjee / Bhattacherjee, Choudhary / Chaudhary, Srivastava / Shrivastava). Words of five
 * letters or more may differ by one letter, nine or more by two. Short words must match exactly.
 */
function similarSpelling(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  if (shorter < 5) return false;
  return editDistance(a, b) <= (shorter >= 9 ? 2 : 1);
}

/**
 * Does an account name ("Dr A. K. Verma") name the same person as a published author
 * ({given:'Anil Kumar', family:'Verma'})?
 *  - Same surname: the first initials must agree when both sides have one.
 *  - Surname spelt slightly differently: accepted only with more proof — both sides must have a
 *    first name, and those must agree too (full names spelt alike, or initials equal).
 * A wrong "no" only asks the owner to add their name and attach evidence; a wrong "yes" is worse.
 */
export function namesMatch(accountName: string, p: Pick<Person, 'given' | 'family' | 'full'>): boolean {
  const o = tokens(accountName);
  if (o.length === 0) return false;
  const oSurname = o[o.length - 1]!;
  const oFirstName = o.length > 1 ? o[0]! : undefined;

  const fam = tokens(p.family);
  let surname: string | undefined;
  let firstName: string | undefined;
  if (fam.length > 0) {
    surname = fam[fam.length - 1];
    firstName = tokens(p.given)[0];
  } else {
    const all = tokens(p.full);
    surname = all[all.length - 1];
    firstName = all.length > 1 ? all[0] : undefined;
  }
  if (!surname) return false;

  if (surname === oSurname) {
    if (!oFirstName || !firstName) return true;
    return oFirstName[0] === firstName[0];
  }

  if (!similarSpelling(surname, oSurname) || !oFirstName || !firstName) return false;
  if (oFirstName.length > 1 && firstName.length > 1) return similarSpelling(oFirstName, firstName);
  return oFirstName[0] === firstName[0];
}

/** BIT Mesra (any campus), not BITS Pilani. ROR id from OpenAlex, verified 2026-10-06. */
export const BIT_ROR = '028vtqb15';

export function isBitAffiliation(name: string, rorIds: string[] = []): boolean {
  if (rorIds.some((id) => id.endsWith(BIT_ROR))) return true;
  return /birla institute of technology(?!\s*(and|&)\s*science)/i.test(name);
}
