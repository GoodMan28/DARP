/*
 * Institutes: how their names are compared, shown and found. Pure functions, shared by the importer,
 * the server (search, validation) and the form.
 */

/** BIT Mesra's AISHE code: the one institute outreach and other "outside BIT" fields refuse. */
export const HOME_INSTITUTE = 'U-0202';

export type InstituteScheme = 'aishe' | 'ror' | 'local';

/** One institute in a search result, and what the form keeps of it. */
export interface InstituteHit {
  /** U-0202 (AISHE), ROR-028vtqb15 (ROR) or DARP-000012 (added here). */
  code: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string;
  scheme: InstituteScheme;
  /** Added by a user and waiting for IQAC to review it. */
  pending: boolean;
}

/**
 * A name as it is compared: lower case, no accents or punctuation, "&" as "and", and initials written
 * with dots joined up, so "B.I.T. Mesra", "BIT, Mesra" and "bit mesra" are the same.
 */
export function normInstitution(s: string): string {
  const t = s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ');
  return t
    .replace(/\b([a-z])\.(?=[a-z]\b)/g, '$1')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim();
}

/** The long names people shorten: "Indian Institute of Technology" is "IIT". */
const SHORT: Array<[string, string]> = [
  ['indian institute of information technology', 'iiit'],
  ['indian institute of science education and research', 'iiser'],
  ['indian institute of technology', 'iit'],
  ['indian institute of management', 'iim'],
  ['national institute of technology', 'nit'],
  ['all india institute of medical sciences', 'aiims'],
];

/** "Indian Institute of Technology, Kharagpur" → ["iit kharagpur"]: the forms people type. */
export function shortForms(name: string): string[] {
  const n = normInstitution(name);
  const out: string[] = [];
  for (const [long, short] of SHORT) {
    if (n === long || n.startsWith(`${long} `)) out.push(`${short}${n.slice(long.length)}`.trim());
  }
  return out;
}

/** The text kept on a record: "Name, State, Country", leaving out any part the name already says. */
export function institutionText(i: { name: string; state: string | null; country: string }): string {
  // Whole words: "Indian Institute…" does not already say "India".
  const has = (part: string) => ` ${normInstitution(i.name)} `.includes(` ${normInstitution(part)} `);
  const parts = [i.name];
  if (i.state && !has(i.state)) parts.push(i.state);
  if (i.country && !has(i.country)) parts.push(i.country);
  return parts.join(', ');
}

/** What a person says an added organisation is, and the type the directory keeps for it (ROR's words). */
export const INSTITUTE_KINDS: Array<{ label: string; kind: string }> = [
  { label: 'College or university', kind: 'education' },
  { label: 'Company', kind: 'company' },
  { label: 'Government or funder', kind: 'government' },
  { label: 'Other', kind: 'other' },
];

/** Countries an added organisation can be in: the countries list without the two patent offices and "Other". */
export const NOT_A_COUNTRY = ['European Patent Office', 'WIPO (PCT)', 'Other'];
