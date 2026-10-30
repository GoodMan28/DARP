import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { ServiceError } from '@/server/records/service';
import type { IdentityPayload, OrcidCheck } from '@darp/shared/contracts';
import type { NameParts } from '@darp/shared/names';
import { getJson, isLookupUnavailable } from './http';
import { isBitAffiliation, namesMatch } from './names';
import { partsOf } from './identity';
import { adoptOrcidIds, dropOrcidIds, refreshResearcher } from '@/server/researchers/service';

/**
 * ORCID iDs, typed by the faculty member and checked against ORCID's free public record
 * (pub.orcid.org, no key). The iD confirms authorship only when that record carries the account's
 * name, so typing a stranger's iD proves nothing. Nothing here is scraped.
 */

/** "https://orcid.org/0000-0002-1825-0097", "0000000218250097" → "0000-0002-1825-0097", or null. */
export function normaliseOrcid(raw: string): string | null {
  const digits = raw.trim().replace(/^https?:\/\/(www\.)?orcid\.org\//i, '').replace(/[\s-]/g, '').toUpperCase();
  if (!/^\d{15}[\dX]$/.test(digits)) return null;
  return digits.match(/.{4}/g)!.join('-');
}

/** The check digit of an ORCID iD (ISO 7064 MOD 11-2), as ORCID specifies it. */
export function orcidChecksumValid(orcid: string): boolean {
  const d = orcid.replace(/-/g, '');
  let total = 0;
  for (const c of d.slice(0, 15)) total = (total + Number(c)) * 2;
  const result = (12 - (total % 11)) % 11;
  return d[15] === (result === 10 ? 'X' : String(result));
}

interface OrcidPerson {
  name?: {
    'given-names'?: { value?: string } | null;
    'family-name'?: { value?: string } | null;
    'credit-name'?: { value?: string } | null;
  } | null;
  'other-names'?: { 'other-name'?: Array<{ content?: string }> } | null;
  'external-identifiers'?: { 'external-identifier'?: Array<{ 'external-id-type'?: string; 'external-id-value'?: string }> } | null;
}

/** The Scopus Author IDs and ResearcherIDs an ORCID record lists under "Other IDs". */
export function externalIdsOf(person: OrcidPerson | null): { scopusAuthorIds: string[]; researcherIds: string[] } {
  const out = { scopusAuthorIds: [] as string[], researcherIds: [] as string[] };
  for (const e of person?.['external-identifiers']?.['external-identifier'] ?? []) {
    const type = (e['external-id-type'] ?? '').toLowerCase().replace(/[\s-]/g, '');
    const value = (e['external-id-value'] ?? '').trim();
    if (type === 'scopusauthorid' && /^\d{10,11}$/.test(value)) out.scopusAuthorIds.push(value);
    if (type === 'researcherid' && /^[A-Z]{1,3}-\d{4}-\d{4}$/i.test(value)) out.researcherIds.push(value.toUpperCase());
  }
  return out;
}

interface OrcidEmployments {
  'affiliation-group'?: Array<{
    summaries?: Array<{ 'employment-summary'?: { organization?: { name?: string; 'disambiguated-organization'?: { 'disambiguated-organization-identifier'?: string; 'disambiguation-source'?: string } } } }>;
  }>;
}

/** BIT Mesra's ROR id, as ORCID records it when an employment is linked to ROR. */
const BIT_ROR_URL = 'https://ror.org/028vtqb15';

export type StoredOrcidCheck = OrcidCheck & { otherNames: string[] };

/** Reads the public ORCID record and compares it with the account's name. Never throws for "not reachable". */
export async function checkOrcid(orcid: string, parts: NameParts | string): Promise<StoredOrcidCheck> {
  const checkedAt = new Date().toISOString();
  const base = `https://pub.orcid.org/v3.0/${orcid}`;
  try {
    const person = (await getJson(`${base}/person`)) as OrcidPerson | null;
    if (!person) return { checkedAt, found: false, nameMatches: false, bitEmployment: false, orcidName: '', otherNames: [] };
    const externalIds = externalIdsOf(person);
    const given = person.name?.['given-names']?.value ?? '';
    const family = person.name?.['family-name']?.value ?? '';
    const credit = person.name?.['credit-name']?.value ?? '';
    const otherNames = (person['other-names']?.['other-name'] ?? []).map((o) => o.content ?? '').filter(Boolean).slice(0, 20);
    const candidates = [
      { given, family, full: `${given} ${family}`.trim() },
      ...[credit, ...otherNames].filter(Boolean).map((full) => ({ given: '', family: '', full })),
    ];
    const nameMatches = candidates.some((c) => (c.full || c.family) && namesMatch(parts, c));

    let bitEmployment = false;
    const jobs = (await getJson(`${base}/employments`)) as OrcidEmployments | null;
    for (const g of jobs?.['affiliation-group'] ?? []) {
      for (const s of g.summaries ?? []) {
        const org = s['employment-summary']?.organization;
        const ror = org?.['disambiguated-organization'];
        if ((ror?.['disambiguation-source'] === 'ROR' && ror['disambiguated-organization-identifier'] === BIT_ROR_URL)
          || isBitAffiliation(org?.name ?? '')) bitEmployment = true;
      }
    }
    return {
      checkedAt, found: true, nameMatches, bitEmployment,
      orcidName: credit || `${given} ${family}`.trim(), otherNames, externalIds,
    };
  } catch (e) {
    if (!isLookupUnavailable(e)) throw e;
    return { checkedAt, found: false, nameMatches: false, bitEmployment: false, orcidName: '', otherNames: [], unchecked: true };
  }
}

/** The person's own name parts and ORCID iD, for My profile. */
export async function identityFor(userId: string): Promise<IdentityPayload> {
  const [u] = await db.select({
    namePrefix: users.namePrefix, firstName: users.firstName, middleName: users.middleName, lastName: users.lastName,
    orcid: users.orcid, orcidCheck: users.orcidCheck,
  }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new ServiceError('NOT_FOUND', 'No such account.');
  const check = u.orcidCheck as StoredOrcidCheck | null;
  const { otherNames: _drop, ...shown } = check ?? { otherNames: [] };
  return { ...u, orcidCheck: check ? (shown as OrcidCheck) : null };
}

/**
 * Saves the person's ORCID iD with what ORCID's record says. A wrong check digit, or an iD ORCID does
 * not know, is refused; an iD under another name is saved but never used to confirm authorship.
 */
export async function saveOrcid(userId: string, raw: string): Promise<IdentityPayload> {
  const orcid = normaliseOrcid(raw);
  if (!orcid || !orcidChecksumValid(orcid)) {
    throw new ServiceError('VALIDATION', 'That is not an ORCID iD.', {
      orcid: 'An ORCID iD is 16 characters, e.g. 0000-0002-1825-0097, and its last character is a check digit.',
    });
  }
  const [u] = await db.select({ name: users.name, prefix: users.namePrefix, first: users.firstName, middle: users.middleName, last: users.lastName })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new ServiceError('NOT_FOUND', 'No such account.');
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.orcid, orcid)).limit(1);
  if (taken && taken.id !== userId) {
    throw new ServiceError('VALIDATION', 'That ORCID iD is already on another account.', {
      orcid: 'Another DARP account already uses this ORCID iD. Ask IQAC if it is yours.',
    });
  }
  const check = await checkOrcid(orcid, partsOf(u));
  if (!check.found && !check.unchecked) {
    throw new ServiceError('VALIDATION', 'ORCID has no record with that iD.', { orcid: 'ORCID has no public record with this iD. Check it on orcid.org.' });
  }
  await db.update(users).set({ orcid, orcidCheck: check, updatedAt: new Date() }).where(eq(users.id, userId));
  // The record's Scopus Author ID and ResearcherID become the person's, and their figures are fetched.
  await adoptOrcidIds(userId);
  void refreshResearcher(userId).catch(() => undefined);
  return identityFor(userId);
}

export async function clearOrcid(userId: string): Promise<IdentityPayload> {
  await dropOrcidIds(userId);
  await db.update(users).set({ orcid: null, orcidCheck: null, updatedAt: new Date() }).where(eq(users.id, userId));
  return identityFor(userId);
}
