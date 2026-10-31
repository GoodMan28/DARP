import { splitName, type NameParts } from '@darp/shared/names';
import type { Person } from './types';

/** Titles dropped from a name before comparing (one word each, the dot already removed). */
const TITLES = /^(dr|prof|professor|mr|mrs|ms|miss|shri|smt|sri|er)$/;

/**
 * Lower-case words without accents or titles. Initials written together in capitals ("AK Verma",
 * "Verma AK") become separate letters, as "A. K. Verma" would.
 */
function tokens(s: string): string[] {
  const words = s.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z]+/).filter(Boolean);
  // In a name written all in capitals ("ANIL KUMAR RAO", as the Patent Office Journal prints them)
  // a short word is an initial pair only when it has no vowel ("AK"), so "RAO" stays a name.
  const allCaps = !words.some((w) => /[a-z]/.test(w));
  const out: string[] = [];
  for (const w of words) {
    const initials = words.length > 1 && w.length >= 2 && w.length <= 3 && w === w.toUpperCase()
      && (!allCaps || !/[AEIOU]/.test(w));
    if (initials) out.push(...w.toLowerCase().split(''));
    else out.push(w.toLowerCase());
  }
  return out.filter((w) => !TITLES.test(w));
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

/** A name as given names and surname words; the surname may be empty (a single name). */
interface Reading { given: string[]; surname: string[] }

function ownerReading(owner: string | NameParts): Reading {
  const parts = typeof owner === 'string' ? splitName(owner) : owner;
  return { given: [...tokens(parts.first), ...tokens(parts.middle)], surname: tokens(parts.last) };
}

/**
 * The ways a published name can be read. A structured name (given/family) is read as it is. A name in
 * one piece is read surname-last ("A. K. Verma"), after a comma as surname-first ("Verma, Anil"),
 * and surname-first when only initials follow ("Verma A K").
 */
function publishedReadings(p: Pick<Person, 'given' | 'family' | 'full'>): Reading[] {
  const family = tokens(p.family);
  if (family.length > 0) return [{ given: tokens(p.given), surname: family }];
  const full = p.full ?? '';
  if (full.includes(',')) {
    const [before, ...after] = full.split(',');
    return [{ given: tokens(after.join(' ')), surname: tokens(before ?? '') }];
  }
  const t = tokens(full);
  if (t.length === 0) return [];
  const out: Reading[] = [{ given: t.slice(0, -1), surname: t.slice(-1) }];
  if (t.length > 1 && t.slice(1).every((w) => w.length === 1)) out.push({ given: t.slice(1), surname: [t[0]!] });
  return out;
}

function givenAgree(o: string | undefined, p: string | undefined): boolean {
  if (!o || !p) return true;
  if (o.length > 1 && p.length > 1) return similarSpelling(o, p);
  return o[0] === p[0];
}

function readingsMatch(o: Reading, p: Reading): boolean {
  // A single name (no surname) must appear whole, as the surname or the first given name.
  if (o.surname.length === 0) {
    const only = o.given[0];
    if (!only || only.length < 2) return false;
    return p.surname.some((w) => w === only) || p.given[0] === only;
  }
  const oSur = o.surname.join('');
  const pSur = p.surname.join('');
  if (!pSur) return false;
  const exact = pSur === oSur || pSur === o.surname[o.surname.length - 1];
  if (!exact && !similarSpelling(pSur, oSur)) return false;
  const [oFirst, oSecond] = o.given;
  const [pFirst, pSecond] = p.given;
  // A slightly different surname needs more proof: both sides must have a first name.
  if (!exact && (!oFirst || !pFirst)) return false;
  if (!givenAgree(oFirst, pFirst)) return false;
  // "A. K. Verma" and "A. P. Verma" are two people.
  if (oSecond && pSecond && oSecond[0] !== pSecond[0]) return false;
  return true;
}

/**
 * Does the owner (their name in parts, or a name in one piece such as "Dr A. K. Verma") name the same
 * person as a published author ({given:'Anil Kumar', family:'Verma'}, or "Verma A.K." in one piece)?
 *  - Same surname: the first names must agree (initials, or full names spelt alike) when both exist.
 *  - Surname spelt slightly differently: accepted only when both sides have a first name that agrees.
 *  - Second initials that both exist must agree.
 *  - No surname at all: the single name must appear whole.
 * A wrong "no" only asks the owner to add their name and attach evidence; a wrong "yes" is worse.
 */
export function namesMatch(owner: string | NameParts, p: Pick<Person, 'given' | 'family' | 'full'>): boolean {
  const o = ownerReading(owner);
  if (o.given.length === 0 && o.surname.length === 0) return false;
  return publishedReadings(p).some((r) => readingsMatch(o, r));
}

/** The owner's name in parts plus any other names (e.g. the "other names" on their ORCID record). */
export interface OwnerNames { parts: NameParts | string; otherNames?: string[] }

export function ownerNamed(owner: OwnerNames, p: Pick<Person, 'given' | 'family' | 'full'>): boolean {
  return namesMatch(owner.parts, p) || (owner.otherNames ?? []).some((n) => namesMatch(n, p));
}

/** BIT Mesra (any campus), not BITS Pilani. ROR id from OpenAlex, verified 2026-10-06. */
export const BIT_ROR = '028vtqb15';

/**
 * BITS Pilani's campuses, which the Patent Office Journal sometimes prints without "and Science"
 * ("Birla Institute of Technology, Hyderabad Campus"). BIT Mesra has no campus in any of them.
 */
const BITS_CAMPUS = /\b(pilani|hyderabad|goa|dubai|k\.?\s*k\.?\s*birla)\b/i;

export function isBitAffiliation(name: string, rorIds: string[] = []): boolean {
  if (rorIds.some((id) => id.endsWith(BIT_ROR))) return true;
  return /birla institute of technology(?!\s*(and|&)\s*science)/i.test(name) && !BITS_CAMPUS.test(name);
}
