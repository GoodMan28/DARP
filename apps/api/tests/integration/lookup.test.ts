import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { createRecord, updateRecord, getRecord, transitionRecord } from '@/server/records/service';
import { uploadEvidence } from '@/server/evidence/service';
import { LookupUnavailable } from '@/server/lookup/http';
import { notFound, type LookupResult } from '@/server/lookup/types';
import type { SessionUser } from '@/server/auth/session';

// The register is faked: these tests are about what the portal does with an answer.
const resolveMock = vi.fn();
vi.mock('@/server/lookup/resolve', () => ({
  resolve: (...args: unknown[]) => resolveMock(...args),
  lookupKey: (_kind: string, raw: string) => raw,
}));

let faculty: SessionUser;
let drie: SessionUser;
let counter = 0;
const nextDoi = () => `10.5555/lookup-test-${(counter += 1)}`;

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
const evidence = async () => (await uploadEvidence(faculty, {
  bytes: PDF, fileName: 'first-page.pdf', declaredMime: 'application/pdf',
  fieldKey: 'evidence', moduleKey: 'publications',
})).id;

/** A Crossref hit that names the signed-in faculty member and passes every check. */
function hit(owner: SessionUser, over: Partial<LookupResult> = {}): LookupResult {
  const [given = 'Test', family = 'faculty'] = owner.name.split(' ');
  return {
    found: true,
    source: 'crossref',
    authoritative: true,
    rawType: 'journal-article',
    values: {
      title: 'A real paper',
      authors: `${owner.name}, Someone Else`,
      containerTitle: 'Real Journal',
      issn: '2168-7161',
      year: '2023',
      volume: '12',
      pages: '1-10',
      indexing: 'SCIE',
      quartile: 'Q1',
      quartileSource: 'SJR 2023 · Scopus list',
      workType: 'Journal article',
    },
    people: [
      { given, family, full: owner.name, orcid: null, bitAffiliated: true },
      { given: 'Someone', family: 'Else', full: 'Someone Else', orcid: null, bitAffiliated: null },
    ],
    identifiers: { issn: ['2168-7161'], isbn: [] },
    flags: [],
    fetchedAt: new Date().toISOString(),
    ...over,
  };
}

/** What the browser sends: an identifier plus whatever the faculty member typed. */
const form = (doi: string, over: Record<string, unknown> = {}) => ({
  doi,
  title: 'typed title',
  journal: 'Real Journal',
  indexing: 'SCIE',
  year: '2023',
  issn: '2168-7161',
  bibliographic: 'typed citation',
  ...over,
});

beforeAll(async () => {
  await truncateAll();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  drie = await makeUser({ role: 'drie' });
});
// Braces matter: a returned function is treated as a teardown and would be called after each test.
beforeEach(() => { resolveMock.mockReset(); });
afterAll(async () => { await closeDb(); });

describe('publications are approved on submission', () => {
  it('approves a fully confirmed paper, with nothing to check and no evidence needed', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { id, status } = await createRecord(faculty, 'publications', form(nextDoi()), 'submit');
    expect(status).toBe('approved');
    const read = await getRecord(faculty, 'publications', id);
    expect(read.verification?.autoApproved).toBe(true);
    expect(read.verification?.reasons).toEqual([]);
    expect(read.history[read.history.length - 1]!.actorName).toBe('DARP automatic check');
  });

  it('approves a paper with unconfirmed details too, listing them as points to check', async () => {
    resolveMock.mockResolvedValue(hit(faculty, { flags: ['not-indexed'] }));
    const { id, status } = await createRecord(
      faculty, 'publications', form(nextDoi(), { evidence: await evidence() }), 'submit',
    );
    expect(status).toBe('approved');
    const read = await getRecord(faculty, 'publications', id);
    expect(read.verification?.autoApproved).toBe(true);
    expect(read.verification?.reasons.join(' ')).toContain('not found in the Scopus list');
  });

  it('overwrites a locked field the browser changed', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { id } = await createRecord(
      faculty, 'publications', form(nextDoi(), { journal: 'Fake Journal', year: '2022', quartile: 'Q4' }), 'submit',
    );
    const read = await getRecord(faculty, 'publications', id);
    expect(read.data.journal).toBe('Real Journal');
    expect(Number(read.data.year)).toBe(2023);
    expect(read.data.quartile).toBe('Q1');
    expect(read.data.title).toBe('A real paper');
  });

  it('generates the citation from the final values', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { id } = await createRecord(faculty, 'publications', form(nextDoi()), 'submit');
    const citation = String((await getRecord(faculty, 'publications', id)).data.bibliographic);
    expect(citation).toContain('A real paper');
    expect(citation).not.toContain('typed citation');
  });
});

describe('the owner must be in the author list', () => {
  const stranger = () => hit(faculty, {
    values: { ...hit(faculty).values, authors: 'Anil Sharma, Someone Else' },
    people: [{ given: 'Anil', family: 'Sharma', full: 'Anil Sharma', orcid: null, bitAffiliated: true }],
  });

  it('refuses to submit when the owner\'s name is not in the author list', async () => {
    resolveMock.mockResolvedValue(stranger());
    await expect(createRecord(faculty, 'publications', form(nextDoi()), 'submit'))
      .rejects.toMatchObject({ code: 'VALIDATION', fields: { authors: expect.stringContaining('must be in the author list') } });
  });

  it('still lets the owner save a draft', async () => {
    resolveMock.mockResolvedValue(stranger());
    const { status } = await createRecord(faculty, 'publications', form(nextDoi()), 'draft');
    expect(status).toBe('draft');
  });

  it('needs evidence when the owner added their own name by hand', async () => {
    resolveMock.mockResolvedValue(stranger());
    const authors = `Anil Sharma, ${faculty.name}`;
    await expect(createRecord(faculty, 'publications', form(nextDoi(), { authors }), 'submit'))
      .rejects.toMatchObject({ code: 'VALIDATION', fields: { evidence: expect.stringContaining('Attach evidence') } });
  });

  it('approves it once the name is added and evidence attached, flagging the added name', async () => {
    resolveMock.mockResolvedValue(stranger());
    const authors = `Anil Sharma, ${faculty.name}`;
    const { id, status } = await createRecord(
      faculty, 'publications', form(nextDoi(), { authors, evidence: await evidence() }), 'submit',
    );
    expect(status).toBe('approved');
    expect((await getRecord(faculty, 'publications', id)).verification?.reasons.join(' ')).toContain('added by hand');
  });
});

describe('details that could not be fetched are entered by hand', () => {
  it('takes a quartile the owner chose when none was found, and flags it', async () => {
    resolveMock.mockResolvedValue(hit(faculty, {
      values: { ...hit(faculty).values, quartile: '', quartileSource: '' }, flags: ['not-indexed'],
    }));
    const { id } = await createRecord(
      faculty, 'publications',
      form(nextDoi(), { quartile: 'Q2', quartileSource: 'SCImago says so', evidence: await evidence() }), 'submit',
    );
    const read = await getRecord(faculty, 'publications', id);
    expect(read.data.quartile).toBe('Q2');
    expect(read.data.quartileSource ?? '').toBe('');          // a claimed source is never taken from the browser
    expect(read.verification?.reasons.join(' ')).toContain('Journal quartile (SJR) could not be found automatically');
  });

  it('falls back to typed details when the register is unavailable, approved with evidence', async () => {
    // Thrown synchronously inside the awaited call: same try/catch path as a rejected promise.
    resolveMock.mockImplementation(() => { throw new LookupUnavailable('down'); });
    const { id, status } = await createRecord(
      faculty, 'publications',
      form(nextDoi(), { authors: faculty.name, quartile: 'Q3', evidence: await evidence() }), 'submit',
    );
    expect(status).toBe('approved');
    const read = await getRecord(faculty, 'publications', id);
    expect(read.verification?.source).toBeNull();
    expect(read.data.title).toBe('typed title');
  });

  it('falls back when the DOI is not found, still requiring evidence', async () => {
    resolveMock.mockResolvedValue(notFound());
    await expect(createRecord(faculty, 'publications', form(nextDoi(), { authors: faculty.name }), 'submit'))
      .rejects.toMatchObject({ code: 'VALIDATION', fields: { evidence: expect.any(String) } });
  });
});

describe('DRIE and IQAC check afterwards', () => {
  it('DRIE can return an approved publication, and the resubmission goes to DRIE', async () => {
    resolveMock.mockResolvedValue(hit(faculty, { flags: ['not-indexed'] }));
    const ev = await evidence();
    const doi = nextDoi();
    const { id, status } = await createRecord(faculty, 'publications', form(doi, { evidence: ev }), 'submit');
    expect(status).toBe('approved');

    const back = await transitionRecord(drie, 'publications', id, 'return', 'The indexing is not Scopus.');
    expect(back.status).toBe('returned');

    const again = await updateRecord(faculty, 'publications', id, form(doi, { evidence: ev }), 'submit');
    expect(again.status).toBe('submitted');                 // not straight back to Approved

    // DRIE's check is final for publications: Verify goes straight to Approved, no IQAC step.
    const verified = await transitionRecord(drie, 'publications', id, 'verify');
    expect(verified.status).toBe('approved');
    const read = await getRecord(faculty, 'publications', id);
    const last = read.history[read.history.length - 1]!;
    expect(last).toMatchObject({ fromStatus: 'submitted', toStatus: 'approved', actorRole: 'drie' });
  });

  it('a draft is never approved, even when everything matches', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { status } = await createRecord(faculty, 'publications', form(nextDoi()), 'draft');
    expect(status).toBe('draft');
  });
});
