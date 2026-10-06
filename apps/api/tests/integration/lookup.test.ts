import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { createRecord, getRecord } from '@/server/records/service';
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
let counter = 0;
const nextDoi = () => `10.5555/lookup-test-${(counter += 1)}`;

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
      quartile: 'Q1 (SJR 2023)',
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
  authors: 'typed authors',
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
});
beforeEach(() => resolveMock.mockReset());
afterAll(async () => { await closeDb(); });

describe('automatic approval', () => {
  it('approves a matching record at once, recorded under the system account', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { id, status } = await createRecord(faculty, 'publications', form(nextDoi()), 'submit');
    expect(status).toBe('approved');

    const read = await getRecord(faculty, 'publications', id);
    expect(read.verification?.autoApproved).toBe(true);
    expect(read.verification?.source).toBe('crossref');
    const last = read.history[read.history.length - 1]!;
    expect(last.toStatus).toBe('approved');
    expect(last.actorName).toBe('DARP automatic check');
  });

  it('overwrites a locked field the browser changed', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { id } = await createRecord(
      faculty, 'publications', form(nextDoi(), { journal: 'Fake Journal', year: '2022' }), 'submit',
    );
    const read = await getRecord(faculty, 'publications', id);
    expect(read.data.journal).toBe('Real Journal');
    expect(read.data.year).toBe('2023');
    expect(read.data.title).toBe('A real paper');
  });

  it('keeps the author list as the owner edited it', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { id } = await createRecord(
      faculty, 'publications', form(nextDoi(), { authors: 'Added By Hand, Another Person' }), 'submit',
    );
    expect((await getRecord(faculty, 'publications', id)).data.authors).toBe('Added By Hand, Another Person');
  });

  it('generates the citation from the final values', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { id } = await createRecord(faculty, 'publications', form(nextDoi()), 'submit');
    const citation = String((await getRecord(faculty, 'publications', id)).data.bibliographic);
    expect(citation).toContain('A real paper');
    expect(citation).toContain('Real Journal');
    expect(citation).not.toContain('typed citation');
  });
});

describe('records that need a person', () => {
  it('sends it to verification when the owner is not on the published record', async () => {
    resolveMock.mockResolvedValue(hit(faculty, {
      people: [{ given: 'Anil', family: 'Sharma', full: 'Anil Sharma', orcid: null, bitAffiliated: true }],
    }));
    const { id, status } = await createRecord(faculty, 'publications', form(nextDoi()), 'submit');
    expect(status).toBe('submitted');
    const read = await getRecord(faculty, 'publications', id);
    expect(read.verification?.autoApproved).toBe(false);
    expect(read.verification?.reasons.join(' ')).toContain('could not be matched');
  });

  it('sends it to verification when the owner is listed only with another institution', async () => {
    resolveMock.mockResolvedValue(hit(faculty, {
      people: [{
        given: 'Test', family: 'faculty', full: faculty.name, orcid: null, bitAffiliated: false,
      }],
    }));
    const { status } = await createRecord(faculty, 'publications', form(nextDoi()), 'submit');
    expect(status).toBe('submitted');
  });

  it('sends a paper published outside the cycle to verification', async () => {
    resolveMock.mockResolvedValue(hit(faculty, { values: { ...hit(faculty).values, year: '2019' } }));
    const { id, status } = await createRecord(faculty, 'publications', form(nextDoi()), 'submit');
    expect(status).toBe('submitted');
    expect((await getRecord(faculty, 'publications', id)).verification?.reasons.join(' '))
      .toContain('outside this reporting cycle');
  });

  it('sends a retracted paper to verification', async () => {
    resolveMock.mockResolvedValue(hit(faculty, { flags: ['retracted'] }));
    const { status } = await createRecord(faculty, 'publications', form(nextDoi()), 'submit');
    expect(status).toBe('submitted');
  });

  it('sends a paper whose journal is in no index list to verification', async () => {
    resolveMock.mockResolvedValue(hit(faculty, { flags: ['not-indexed'] }));
    const { status } = await createRecord(faculty, 'publications', form(nextDoi()), 'submit');
    expect(status).toBe('submitted');
  });

  it('sends a conference paper to verification', async () => {
    resolveMock.mockResolvedValue(hit(faculty, { rawType: 'proceedings-article' }));
    const { status } = await createRecord(faculty, 'publications', form(nextDoi()), 'submit');
    expect(status).toBe('submitted');
  });
});

describe('when the register is unavailable', () => {
  it('falls back to the typed details and a human check', async () => {
    resolveMock.mockRejectedValue(new LookupUnavailable('down'));
    const { id, status } = await createRecord(faculty, 'publications', form(nextDoi()), 'submit');
    expect(status).toBe('submitted');
    const read = await getRecord(faculty, 'publications', id);
    expect(read.verification?.source).toBeNull();
    expect(read.data.title).toBe('typed title');
  });

  it('falls back when the DOI is not found', async () => {
    resolveMock.mockResolvedValue(notFound());
    const { status } = await createRecord(faculty, 'publications', form(nextDoi()), 'submit');
    expect(status).toBe('submitted');
  });
});

describe('drafts', () => {
  it('is never approved, even when everything matches', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { status } = await createRecord(faculty, 'publications', form(nextDoi()), 'draft');
    expect(status).toBe('draft');
  });
});
