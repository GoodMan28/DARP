import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { users } from '@/server/db/schema';
import { makeUser } from '../helpers/factories';
import { uploadEvidence } from '@/server/evidence/service';
import {
  saveResearchIds, saveWos, researchProfile, researchQuality, refreshNow, setThresholds, refreshSomeResearchers, adoptOrcidIds, dropOrcidIds,
} from '@/server/researchers/service';
import type { SessionUser } from '@/server/auth/session';

/* Phase 8: research IDs, Scopus figures (Elsevier mocked), typed WoS figures, and who sees them. */

let verma: SessionUser;
let other: SessionUser;
let hodCse: SessionUser;
let hodMe: SessionUser;
let admin: SessionUser;

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

/** The test accounts are named "Test faculty 1": first name Test, surname faculty. */
const OWN_NAME = { given: 'Test', surname: 'Faculty' };

/** Elsevier, faked: the Scopus profile under `name`, with 3 documents. */
function elsevier(name: { given: string; surname: string }, citations: 'ok' | 'forbidden' = 'ok') {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url.includes('view=METRICS')) return json({ 'author-retrieval-response': [{ coredata: { 'document-count': '12', 'citation-count': '90' }, 'h-index': '5' }] });
    if (url.includes('view=LIGHT')) return json({ 'author-retrieval-response': [{ 'preferred-name': { 'given-name': name.given, surname: name.surname, 'indexed-name': `${name.surname} ${name.given[0]}.` } }] });
    if (url.includes('/search/scopus')) {
      return json({ 'search-results': { 'opensearch:totalResults': '3', entry: [1, 2, 3].map((i) => ({ 'dc:identifier': `SCOPUS_ID:${i}`, 'citedby-count': '9' })) } });
    }
    if (url.includes('/abstract/citations')) {
      return citations === 'forbidden' ? json({}, 403) : json({ citeInfo: [{ pcc: '6', rowTotal: '1' }, { pcc: '3' }, { rowTotal: '2' }] });
    }
    return new Response('{}', { status: 404 });
  }));
}

/** Elsevier off campus: author views refused (401), the paper search answering; `matching` of 10 papers carry the name. */
function elsevierSearchOnly(matching: number, calls: string[] = []) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    calls.push(decodeURIComponent(url));
    if (url.includes('/author/')) return json({}, 401);
    if (url.includes('/abstract/citations')) return json({}, 403);
    if (url.includes('/search/scopus')) {
      const q = decodeURIComponent(url);
      const total = q.includes('AUTHLASTNAME') ? matching : q.includes('AF-ID') ? 4 : 10;
      const asks = q.includes('count=1&') || q.includes('count=1');
      return json({ 'search-results': { 'opensearch:totalResults': String(total), entry: asks && !q.includes('count=25') ? [{ 'dc:identifier': 'SCOPUS_ID:1' }] : [1, 2, 3].map((i) => ({ 'dc:identifier': `SCOPUS_ID:${i}`, 'citedby-count': '9' })) } });
    }
    return new Response('{}', { status: 404 });
  }));
}

beforeAll(async () => {
  await truncateAll();
  verma = await makeUser({ role: 'faculty', dept: 'CSE' });
  other = await makeUser({ role: 'faculty', dept: 'ME' });
  hodCse = await makeUser({ role: 'hod', dept: 'CSE' });
  hodMe = await makeUser({ role: 'hod', dept: 'ME' });
  admin = await makeUser({ role: 'admin' });
  process.env.ELSEVIER_GAP_MS = '0';
  delete process.env.ELSEVIER_API_KEY;      // a real key in .env.local must never reach these tests
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.ELSEVIER_API_KEY; });
afterAll(async () => { await closeDb(); });

describe('Scopus Author ID', () => {
  it('saves the ID without Elsevier, and says Scopus is not connected yet', async () => {
    const p = await saveResearchIds(verma, { scopusAuthorId: '57200000001', researcherId: 'aab-1234-2020' });
    expect(p).toMatchObject({ scopusAuthorId: '57200000001', researcherId: 'AAB-1234-2020', scopusConnected: false, scopus: null });
    expect(p.scopusCheck?.unchecked).toBe('no-key');
    // With no source connected and no ORCID iD, a refresh fetches nothing and changes nothing.
    await expect(refreshNow(verma, verma.id)).resolves.toMatchObject({ scopus: null, openalex: null });
  });

  it('refuses IDs in the wrong form, and an ID already on another account', async () => {
    await expect(saveResearchIds(other, { scopusAuthorId: '1234' })).rejects.toMatchObject({ fields: { scopusAuthorId: expect.any(String) } });
    await expect(saveResearchIds(other, { researcherId: 'ABCD-12-2020' })).rejects.toMatchObject({ fields: { researcherId: expect.any(String) } });
    await expect(saveResearchIds(other, { scopusAuthorId: '57200000001' })).rejects.toMatchObject({ fields: { scopusAuthorId: expect.stringContaining('Another DARP account') } });
  });

  it('keeps the figures of a Scopus profile under another name, flagged not verified, and says whose it is', async () => {
    process.env.ELSEVIER_API_KEY = 'test-key';
    elsevier({ given: 'Zed', surname: 'Nobody' });
    const p = await refreshNow(verma, verma.id);
    expect(p.scopusCheck).toMatchObject({ nameMatches: false, scopusName: 'Zed Nobody' });
    expect(p.scopus).toMatchObject({ documents: 12, verified: false });
  });

  it('stores the figures from the person’s own profile, with and without self-citations', async () => {
    process.env.ELSEVIER_API_KEY = 'test-key';
    elsevier(OWN_NAME);
    const p = await refreshNow(verma, verma.id);
    expect(p.scopusCheck?.nameMatches).toBe(true);
    expect(p.scopus).toMatchObject({ documents: 12, citations: 90, hIndex: 5, citationsExclSelf: 12, hIndexExclSelf: 2 });
    expect(p.signal.citationsPerPaper).toBe(1);
  });

  it('keeps the figures without self-citations empty when Citation Overview is not enabled', async () => {
    process.env.ELSEVIER_API_KEY = 'test-key';
    elsevier(OWN_NAME, 'forbidden');
    const p = await refreshNow(verma, verma.id);
    expect(p.scopus).toMatchObject({ documents: 12, hIndex: 5, citationsExclSelf: null, hIndexExclSelf: null });
    expect(p.scopusCheck?.noCitationOverview).toBe(true);
    expect(p.signal).toMatchObject({ citationsPerPaper: 7.5, citationsInclSelf: true });
  });

  it('checks a typed ID by the papers’ author names when Elsevier refuses the author views', async () => {
    process.env.ELSEVIER_API_KEY = 'test-key';
    const typist = await makeUser({ role: 'faculty', dept: 'CSE' });
    await db.update(users).set({ scopusAuthorId: '57200000777', firstName: 'Test', lastName: 'Faculty' }).where(eq(users.id, typist.id));
    const calls: string[] = [];
    elsevierSearchOnly(10, calls);
    const p = await refreshNow(typist, typist.id);
    expect(p.scopusCheck).toMatchObject({ nameMatches: true, nameShare: 1 });
    expect(p.scopus).toMatchObject({ documents: 3 });
    expect(p.scopusBitDocuments).toBe(4);
    expect(calls.some((c) => c.includes('AUTHLASTNAME(Faculty)') && c.includes('AUTHFIRST(T)'))).toBe(true);
  });

  it('accepts a person whose surname is spelled differently on some papers (7 of 10)', async () => {
    process.env.ELSEVIER_API_KEY = 'test-key';
    const spelled = await makeUser({ role: 'faculty', dept: 'CSE' });
    await db.update(users).set({ scopusAuthorId: '57200000779', firstName: 'Test', lastName: 'Faculty' }).where(eq(users.id, spelled.id));
    elsevierSearchOnly(7);
    const p = await refreshNow(spelled, spelled.id);
    expect(p.scopusCheck).toMatchObject({ nameMatches: true, nameShare: 0.7 });
    expect(p.scopus).toMatchObject({ documents: 3, verified: true });
  });

  it('flags the figures not verified when too few of the ID’s papers carry the person’s name', async () => {
    process.env.ELSEVIER_API_KEY = 'test-key';
    const stranger = await makeUser({ role: 'faculty', dept: 'CSE' });
    await db.update(users).set({ scopusAuthorId: '57200000778', firstName: 'Test', lastName: 'Faculty' }).where(eq(users.id, stranger.id));
    elsevierSearchOnly(2);
    const p = await refreshNow(stranger, stranger.id);
    expect(p.scopusCheck).toMatchObject({ nameMatches: false, nameShare: 0.2 });
    expect(p.scopus).toMatchObject({ documents: 3, verified: false });
  });

  it('refreshes about a thirtieth of the people each night, oldest first', async () => {
    process.env.ELSEVIER_API_KEY = 'test-key';
    elsevier({ given: 'Zed', surname: 'Nobody' });
    expect(await refreshSomeResearchers()).toBe(1);
  });
});

describe('Web of Science figures', () => {
  it('needs the person’s own screenshot', async () => {
    const wos = { documents: 8, citationsExclSelf: 40, hIndex: 3, asOf: '2026-10-01' };
    const theirs = (await uploadEvidence(other, { bytes: PNG, fileName: 'wos.png', declaredMime: 'image/png', fieldKey: 'wosEvidence', moduleKey: null })).id;
    await expect(saveWos(verma, { ...wos, evidenceId: theirs })).rejects.toMatchObject({ fields: { evidenceId: expect.any(String) } });
    const mine = (await uploadEvidence(verma, { bytes: PNG, fileName: 'wos.png', declaredMime: 'image/png', fieldKey: 'wosEvidence', moduleKey: null })).id;
    const p = await saveWos(verma, { ...wos, evidenceId: mine });
    expect(p.wos).toMatchObject({ documents: 8, citationsExclSelf: 40, hIndex: 3, asOf: '2026-10-01', evidenceId: mine });
    expect(p.signal.wosShare).toBe(67);                       // 8 of Scopus's 12
    await expect(saveWos(verma, { ...wos, asOf: '2099-01-01', evidenceId: mine })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('IDs and figures from the ORCID iD', () => {
  // The record of the screenshot: ORCID 0000-0002-2990-4738 lists ResearcherID M-9975-2013 and Scopus 35449392500.
  const ORCID = '0000-0002-2990-4738';
  const orcidCheck = (nameMatches: boolean) => ({
    checkedAt: new Date().toISOString(), found: true, nameMatches, bitEmployment: true, orcidName: 'Test Faculty', otherNames: [],
    externalIds: { scopusAuthorIds: ['35449392500'], researcherIds: ['M-9975-2013'] },
  });
  let ghosh: SessionUser;
  let namesake: SessionUser;

  beforeAll(async () => {
    ghosh = await makeUser({ role: 'faculty', dept: 'CSE' });
    namesake = await makeUser({ role: 'faculty', dept: 'CSE' });
  });

  it('reads the Scopus Author ID and ResearcherID off a trusted ORCID record', async () => {
    await db.update(users).set({ orcid: ORCID, orcidCheck: orcidCheck(true) }).where(eq(users.id, ghosh.id));
    await adoptOrcidIds(ghosh.id);
    const p = await researchProfile(ghosh, ghosh.id);
    expect(p).toMatchObject({
      orcid: ORCID, orcidTrusted: true, scopusAuthorId: '35449392500', researcherId: 'M-9975-2013',
      idsFromOrcid: { scopusAuthorId: true, researcherId: true },
    });
  });

  it('takes nothing from an ORCID record under another name, or IDs another account holds', async () => {
    await db.update(users).set({ orcid: '0000-0002-1825-0097', orcidCheck: orcidCheck(false) }).where(eq(users.id, namesake.id));
    await adoptOrcidIds(namesake.id);
    expect((await researchProfile(namesake, namesake.id)).scopusAuthorId).toBeNull();
    await db.update(users).set({ orcidCheck: orcidCheck(true) }).where(eq(users.id, namesake.id));
    await adoptOrcidIds(namesake.id);                         // the IDs are already Ghosh's
    expect((await researchProfile(namesake, namesake.id)).scopusAuthorId).toBeNull();
  });

  it('fetches OpenAlex’s figures by the ORCID iD', async () => {
    delete process.env.LOOKUP_OFFLINE;                       // this test stubs fetch: no live call is made
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toContain(`api.openalex.org/authors/orcid:${ORCID}`);
      return new Response(JSON.stringify({
        id: 'https://openalex.org/A5088174944', display_name: 'Animesh Ghosh', works_count: 155, cited_by_count: 3271, summary_stats: { h_index: 34 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const p = await refreshNow(ghosh, ghosh.id);
    expect(p.openalex).toMatchObject({ source: 'openalex', documents: 155, citations: 3271, hIndex: 34 });
    process.env.LOOKUP_OFFLINE = '1';
  });

  it('fetches Web of Science’s figures by ResearcherID once Clarivate’s key is set, if the profile is theirs', async () => {
    process.env.CLARIVATE_API_KEY = 'test-key';
    process.env.CLARIVATE_GAP_MS = '0';
    const wos = (orcids: string[]) => vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('openalex')) return new Response('{}', { status: 404 });
      expect(url).toBe('https://api.clarivate.com/apis/wos-researcher/researchers/M-9975-2013');
      expect((init?.headers as Record<string, string>)['X-ApiKey']).toBe('test-key');
      return new Response(JSON.stringify({
        ids: { rids: ['M-9975-2013'], orcids }, name: { fullName: 'Zed Nobody', firstName: 'Zed', lastName: 'Nobody' },
        metricsAllTime: { hIndex: 28, documents: { count: 120 }, totalTimesCited: 2900, totalTimesCitedWithoutSelf: 2600 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    wos([]);                                                  // a stranger's profile: kept, but not verified
    let p = await refreshNow(ghosh, ghosh.id);
    expect(p.wos).toMatchObject({ documents: 120, verified: false });
    expect(p.scopusCheck?.wos).toMatchObject({ nameMatches: false, wosName: 'Zed Nobody' });
    wos([ORCID]);                                             // the profile lists their ORCID iD: it is theirs
    p = await refreshNow(ghosh, ghosh.id);
    expect(p.wos).toMatchObject({ documents: 120, citations: 2900, citationsExclSelf: 2600, hIndex: 28, typed: false, verified: true });
    expect(p.wosConnected).toBe(true);
    await expect(saveWos(ghosh, { documents: 1, citationsExclSelf: 1, hIndex: 1, asOf: '2026-10-01', evidenceId: '00000000-0000-0000-0000-000000000000' }))
      .rejects.toMatchObject({ message: expect.stringContaining('fetched automatically') });
    delete process.env.CLARIVATE_API_KEY;
  });

  it('drops the IDs that came from ORCID when the ORCID iD is removed', async () => {
    await dropOrcidIds(ghosh.id);
    const p = await researchProfile(ghosh, ghosh.id);
    expect(p).toMatchObject({ scopusAuthorId: null, researcherId: null });
  });
});

describe('who sees what', () => {
  it('shows a person’s figures to them, their HOD, DRIE and IQAC only', async () => {
    await expect(researchProfile(hodCse, verma.id)).resolves.toMatchObject({ userId: verma.id });
    await expect(researchProfile(admin, verma.id)).resolves.toMatchObject({ userId: verma.id });
    await expect(researchProfile(hodMe, verma.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(researchProfile(other, verma.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('gives IQAC everyone in the table, a HOD their department, and faculty nothing', async () => {
    const all = await researchQuality(admin, null, null);
    expect(all.rows.map((r) => r.userId)).toEqual(expect.arrayContaining([verma.id, other.id]));
    const cse = await researchQuality(hodCse, null, null);
    expect(cse.rows.map((r) => r.userId)).toContain(verma.id);
    expect(cse.rows.map((r) => r.userId)).not.toContain(other.id);
    await expect(researchQuality(verma, null, null)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets only IQAC change the thresholds, within sense', async () => {
    await expect(setThresholds(hodCse, { qualityWosShare: 40 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(setThresholds(admin, { qualityWosShare: 140 })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await setThresholds(admin, { qualityWosShare: 40 })).toMatchObject({ qualityWosShare: 40, qualityTopShare: 50 });
  });
});

