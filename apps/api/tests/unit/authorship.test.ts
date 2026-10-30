import { describe, it, expect } from 'vitest';
import { normaliseOrcid, orcidChecksumValid } from '@/server/lookup/orcid';
import { authorshipOf } from '@/server/lookup/apply';
import { notFound, type LookupResult, type Person } from '@/server/lookup/types';
import type { OwnerIdentity } from '@/server/lookup/identity';
import { composeName, splitName } from '@darp/shared/names';
import { MODULES } from '@darp/shared/modules';

const ORCID = '0000-0002-1825-0097';          // ORCID's own example record (Josiah Carberry)

describe('ORCID iDs', () => {
  it('accepts the usual ways of writing one', () => {
    expect(normaliseOrcid('0000-0002-1825-0097')).toBe(ORCID);
    expect(normaliseOrcid('https://orcid.org/0000-0002-1825-0097')).toBe(ORCID);
    expect(normaliseOrcid('0000000218250097')).toBe(ORCID);
    expect(normaliseOrcid('0000-0002-1694-233x')).toBe('0000-0002-1694-233X');
    expect(normaliseOrcid('1234')).toBeNull();
  });

  it('checks the last character, which ORCID computes from the others', () => {
    expect(orcidChecksumValid(ORCID)).toBe(true);
    expect(orcidChecksumValid('0000-0002-1694-233X')).toBe(true);
    expect(orcidChecksumValid('0000-0002-1825-0098')).toBe(false);
  });
});

describe('names in parts', () => {
  it('builds the display name from its parts', () => {
    expect(composeName({ prefix: 'Prof. (Dr.)', first: 'Sanjay', middle: 'Kumar', last: 'Mishra' })).toBe('Prof. (Dr.) Sanjay Kumar Mishra');
    expect(composeName({ prefix: 'Dr.', first: 'Ramanathan', middle: '', last: '' })).toBe('Dr. Ramanathan');
  });

  it('splits a name typed in one piece', () => {
    expect(splitName('Prof. (Dr.) Sanjay Kumar Mishra')).toEqual({ prefix: 'Prof. (Dr.)', first: 'Sanjay', middle: 'Kumar', last: 'Mishra' });
    expect(splitName('Dr A. K. Verma')).toEqual({ prefix: 'Dr.', first: 'A.', middle: 'K.', last: 'Verma' });
    expect(splitName('Ramanathan')).toEqual({ prefix: '', first: 'Ramanathan', middle: '', last: '' });
  });
});

describe('how sure the portal is of authorship', () => {
  const person = (over: Partial<Person>): Person => ({ given: '', family: '', full: '', orcid: null, bitAffiliated: null, ...over });
  const paper = (people: Person[]): LookupResult => ({ ...notFound(), found: true, authoritative: true, people });
  const verma: OwnerIdentity = {
    name: 'Dr. Anil Kumar Verma', parts: { prefix: 'Dr.', first: 'Anil', middle: 'Kumar', last: 'Verma' }, otherNames: [], orcid: null,
  };
  const withOrcid = { ...verma, orcid: ORCID };
  const pubs = MODULES.publications!;

  it('is confirmed when the checked ORCID iD is on the paper, however the name is printed', () => {
    const r = paper([person({ given: 'A.', family: 'Varma', orcid: ORCID })]);
    expect(authorshipOf(pubs, r, withOrcid).level).toBe('confirmed');
  });

  it('is likely when the name is listed with BIT Mesra', () => {
    const r = paper([person({ given: 'A. K.', family: 'Verma', bitAffiliated: true })]);
    expect(authorshipOf(pubs, r, verma).level).toBe('likely');
  });

  it('is name-only when the affiliation is unknown or elsewhere', () => {
    expect(authorshipOf(pubs, paper([person({ given: 'Anil', family: 'Verma' })]), verma).level).toBe('name');
    expect(authorshipOf(pubs, paper([person({ given: 'Anil', family: 'Verma', bitAffiliated: false })]), verma).level).toBe('name');
  });

  it('does not trust a namesake who carries a different ORCID iD', () => {
    const r = paper([person({ given: 'Anil Kumar', family: 'Verma', bitAffiliated: true, orcid: '0000-0002-1694-233X' })]);
    expect(authorshipOf(pubs, r, withOrcid).level).toBe('unmatched');
    expect(authorshipOf(pubs, r, verma).level).toBe('likely');      // without an iD of his own, the name is all there is
  });

  it('needs checking when nobody listed has the name', () => {
    expect(authorshipOf(pubs, paper([person({ given: 'Sunil', family: 'Verma' })]), verma).level).toBe('unmatched');
  });

  it('reads an inventor at a BIT Mesra address as likely', () => {
    const r = paper([person({ full: 'ANIL KUMAR VERMA', bitAffiliated: true })]);
    const a = authorshipOf(MODULES.patents!, r, verma);
    expect(a.level).toBe('likely');
    expect(a.detail).toContain('BIT Mesra address');
  });
});
