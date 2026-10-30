import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { users } from '@/server/db/schema';
import { saveOrcid, identityFor, clearOrcid } from '@/server/lookup/orcid';
import { ownerIdentity } from '@/server/lookup/identity';
import { namePartsFrom } from '@/server/auth/accounts';
import type { SessionUser } from '@/server/auth/session';

/*
 * ORCID's public record is stubbed: nothing is sent to orcid.org. Lookups are switched back on for
 * these tests only, so the real fetch path (and its 404 handling) is exercised.
 */

const ORCID = '0000-0002-1825-0097';
const OTHER = '0000-0002-1694-233X';
let me: SessionUser;
let other: SessionUser;

function stubOrcid(person: unknown, employer = 'Birla Institute of Technology, Mesra') {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = String(url).endsWith('/employments')
      ? { 'affiliation-group': [{ summaries: [{ 'employment-summary': { organization: { name: employer } } }] }] }
      : person;
    return body === null ? new Response('', { status: 404 }) : Response.json(body);
  }));
}
const person = (given: string, family: string, otherNames: string[] = []) => ({
  name: { 'given-names': { value: given }, 'family-name': { value: family }, 'credit-name': null },
  'other-names': { 'other-name': otherNames.map((content) => ({ content })) },
});

beforeAll(async () => {
  await truncateAll();
  me = await makeUser({ role: 'faculty', dept: 'CSE' });
  other = await makeUser({ role: 'faculty', dept: 'CSE' });
  await db.update(users).set({ name: 'Dr. Anil Kumar Verma', namePrefix: 'Dr.', firstName: 'Anil', middleName: 'Kumar', lastName: 'Verma' })
    .where(eq(users.id, me.id));
  process.env.LOOKUP_OFFLINE = '0';
});
afterEach(() => { vi.unstubAllGlobals(); });
afterAll(async () => { process.env.LOOKUP_OFFLINE = '1'; await closeDb(); });

describe('names in parts on accounts', () => {
  it('composes the display name and checks the parts', () => {
    expect(namePartsFrom({ namePrefix: 'Prof. (Dr.)', firstName: 'Sanjay', middleName: 'Kumar', lastName: 'Mishra' }))
      .toMatchObject({ ok: true, name: 'Prof. (Dr.) Sanjay Kumar Mishra' });
    expect(namePartsFrom({ firstName: 'Ramanathan' })).toMatchObject({ ok: true, name: 'Ramanathan' });
    expect(namePartsFrom({ name: 'Dr A. K. Verma' })).toMatchObject({ ok: true, parts: { prefix: 'Dr.', last: 'Verma' } });
    expect(namePartsFrom({ namePrefix: 'Sir', firstName: 'Anil' })).toMatchObject({ ok: false });
    expect(namePartsFrom({ firstName: '' })).toMatchObject({ ok: false });
  });
});

describe('ORCID iD on My profile', () => {
  it('refuses an iD whose check digit is wrong, without asking ORCID', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(saveOrcid(me.id, '0000-0002-1825-0098')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(f).not.toHaveBeenCalled();
  });

  it('refuses an iD ORCID does not know', async () => {
    stubOrcid(null);
    await expect(saveOrcid(me.id, ORCID)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('saves an iD under the same name and uses it to confirm authorship', async () => {
    stubOrcid(person('A. K.', 'Verma', ['Anil K. Verma']));
    const saved = await saveOrcid(me.id, `https://orcid.org/${ORCID}`);
    expect(saved.orcid).toBe(ORCID);
    expect(saved.orcidCheck).toMatchObject({ found: true, nameMatches: true, bitEmployment: true });
    const who = await ownerIdentity(me.id, me.name);
    expect(who.orcid).toBe(ORCID);
    expect(who.otherNames).toEqual(['Anil K. Verma']);
  });

  it('keeps one iD to one account', async () => {
    stubOrcid(person('A. K.', 'Verma'));
    await expect(saveOrcid(other.id, ORCID)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('saves an iD under another name but never trusts it', async () => {
    stubOrcid(person('Josiah', 'Carberry'), 'Brown University');
    const saved = await saveOrcid(other.id, OTHER);
    expect(saved.orcidCheck).toMatchObject({ found: true, nameMatches: false, bitEmployment: false, orcidName: 'Josiah Carberry' });
    expect((await ownerIdentity(other.id, other.name)).orcid).toBeNull();
  });

  it('saves the iD unchecked when ORCID cannot be reached, and does not use it', async () => {
    await clearOrcid(other.id);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const saved = await saveOrcid(other.id, OTHER);
    expect(saved.orcidCheck).toMatchObject({ unchecked: true });
    expect((await ownerIdentity(other.id, other.name)).orcid).toBeNull();
  });

  it('shows the parts and the check, without the other names', async () => {
    const shown = await identityFor(me.id);
    expect(shown).toMatchObject({ namePrefix: 'Dr.', firstName: 'Anil', middleName: 'Kumar', lastName: 'Verma', orcid: ORCID });
    expect(shown.orcidCheck).not.toHaveProperty('otherNames');
  });
});
