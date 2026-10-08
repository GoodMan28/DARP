import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { createRecord, updateRecord, getRecord, transitionRecord, listRecords } from '@/server/records/service';
import { uploadEvidence } from '@/server/evidence/service';
import { lookupForForm } from '@/server/lookup/form';
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
const evidence = async (moduleKey = 'publications') => (await uploadEvidence(faculty, {
  bytes: PDF, fileName: 'first-page.pdf', declaredMime: 'application/pdf',
  fieldKey: 'evidence', moduleKey,
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
  title: 'A real paper',            // as the publisher has it: a different title would be a change
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
  it('approves a fully confirmed paper, with nothing to check', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { id, status } = await createRecord(faculty, 'publications', form(nextDoi(), { evidence: await evidence() }), 'submit');
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

  it('needs evidence on every paper, even when everything matches', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    await expect(createRecord(faculty, 'publications', form(nextDoi()), 'submit'))
      .rejects.toMatchObject({ code: 'VALIDATION', fields: { evidence: expect.stringContaining('required') } });
  });

  it('generates the citation from the final values', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { id } = await createRecord(faculty, 'publications', form(nextDoi(), { evidence: await evidence() }), 'submit');
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
      .rejects.toMatchObject({ code: 'VALIDATION', fields: { evidence: expect.any(String) } });
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
    expect(read.data.quartileSource).toBe('Chosen by the faculty member');   // never the claimed source
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
    expect(read.data.title).toBe('A real paper');
  });

  it('falls back when the DOI is not found, still requiring evidence', async () => {
    resolveMock.mockResolvedValue(notFound());
    await expect(createRecord(faculty, 'publications', form(nextDoi(), { authors: faculty.name }), 'submit'))
      .rejects.toMatchObject({ code: 'VALIDATION', fields: { evidence: expect.any(String) } });
  });
});

describe('what the form says after Fetch details', () => {
  it('says when the quartile could not be found, instead of only "everything matches"', async () => {
    resolveMock.mockResolvedValue(hit(faculty, { values: { ...hit(faculty).values, quartile: '', quartileSource: '' } }));
    const res = await lookupForForm(faculty, 'publications', nextDoi());
    expect(res.notes.join(' ')).toContain('Journal quartile (SJR) was not found automatically');
    expect(res.locked).not.toContain('quartile');
  });

  it('asks for evidence in Books & Chapters even when everything matches', async () => {
    const doi = nextDoi();
    resolveMock.mockResolvedValue(hit(faculty, {
      rawType: 'book-chapter',
      values: {
        doi, authors: `${faculty.name}, Someone Else`, year: '2023', workType: 'Book chapter', bookType: 'Book chapter',
        chapterTitle: 'A chapter', bookTitle: 'A book', isbn: '9781509064717', publisher: 'Springer',
      },
      identifiers: { issn: [], isbn: ['9781509064717'] },
    }));
    const res = await lookupForForm(faculty, 'books', doi);
    expect(res.notes.at(-1)).toContain('Attach the evidence and press "Save and submit"');
  });

  it('says which required detail the publisher did not register, and does not call it a full match', async () => {
    const doi = nextDoi();
    resolveMock.mockResolvedValue(hit(faculty, {
      rawType: 'proceedings-article',
      values: {
        doi, authors: faculty.name, year: '2024', workType: 'Conference paper', bookType: 'Conference paper',
        chapterTitle: 'A paper', bookTitle: 'Proceedings of a conference', publisher: 'AIP Publishing',
      },
      identifiers: { issn: [], isbn: [] },
    }));
    const notes = (await lookupForForm(faculty, 'books', doi)).notes.join(' ');
    expect(notes).toContain("ISBN number is not in the publisher's record");
    expect(notes).not.toContain('Everything matches');
  });

  it('offers Books & Chapters for a conference paper', async () => {
    resolveMock.mockResolvedValue(hit(faculty, { rawType: 'proceedings-article', values: { ...hit(faculty).values, workType: 'Conference paper' } }));
    const res = await lookupForForm(faculty, 'publications', nextDoi());
    expect(res.moveTo).toEqual({ moduleKey: 'books', name: 'Books & Chapters' });
  });
});

describe('papers from outside the reporting cycle', () => {
  const old = () => hit(faculty, { values: { ...hit(faculty).values, year: '2019' } });

  it('refuses to submit them, saying only that', async () => {
    resolveMock.mockResolvedValue(old());
    await expect(createRecord(faculty, 'publications', form(nextDoi(), { year: '2019' }), 'submit')).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('published in 2019'),
      fields: { year: expect.stringContaining('covers 2022–2024') },
    });
  });

  it('still lets them be kept as a draft, listed under their own year', async () => {
    resolveMock.mockResolvedValue(old());
    const { id, status } = await createRecord(faculty, 'publications', form(nextDoi(), { year: '2019' }), 'draft');
    expect(status).toBe('draft');
    expect((await getRecord(faculty, 'publications', id)).periodLabel).toBe('2019');
  });

  it('refuses a book or chapter from outside the cycle as well', async () => {
    resolveMock.mockImplementation(() => { throw new LookupUnavailable('down'); });
    await expect(createRecord(faculty, 'books', {
      isbn: '9781509064717', publicationType: 'Book', sameAffiliation: 'Yes', bookTitle: 'An old book',
      year: '2020', publisher: 'x', bibliographic: 'x', evidence: await evidence('books'),
    }, 'submit')).rejects.toMatchObject({ code: 'VALIDATION', fields: { year: expect.stringContaining('covers 2022–2024') } });
  });

  it('refuses a year typed by hand too, when the register is unavailable', async () => {
    resolveMock.mockImplementation(() => { throw new LookupUnavailable('down'); });
    await expect(createRecord(
      faculty, 'publications', form(nextDoi(), { authors: faculty.name, year: '2018', evidence: await evidence() }), 'submit',
    )).rejects.toMatchObject({ code: 'VALIDATION', fields: { year: expect.stringContaining('2018') } });
  });
});

describe('the owner may change a fetched detail; DRIE and IQAC see the change', () => {
  it('keeps the changed value, records the publisher\x27s, and makes it a point to check', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { id, status } = await createRecord(
      faculty, 'publications',
      form(nextDoi(), { title: 'A real paper', journal: 'Real Journal of Things', quartile: 'Q1', evidence: await evidence() }), 'submit',
    );
    expect(status).toBe('approved');                     // still approved on submission
    const read = await getRecord(drie, 'publications', id);
    expect(read.data.journal).toBe('Real Journal of Things');
    expect(read.verification?.fields).toEqual({ journal: { origin: 'changed', fetched: 'Real Journal' } });
    expect(read.verification?.reasons.join(' ')).toContain('Name of journal was changed by the faculty member');
    expect(read.lockedFields).not.toContain('journal');  // shown open on the form, with the publisher's value
    expect(read.lockedFields).toContain('issn');
  });

  it('says on the quartile source that the faculty member changed the quartile', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { id } = await createRecord(
      faculty, 'publications', form(nextDoi(), { quartile: 'Q2', evidence: await evidence() }), 'submit',
    );
    const read = await getRecord(faculty, 'publications', id);
    expect(read.data.quartile).toBe('Q2');
    expect(read.data.quartileSource).toBe('Changed by the faculty member; SJR 2023 · Scopus list gave Q1');
  });

  it('does not treat a difference in case or spacing as a change', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { id } = await createRecord(
      faculty, 'publications', form(nextDoi(), { title: 'a  REAL paper', evidence: await evidence() }), 'submit',
    );
    const read = await getRecord(faculty, 'publications', id);
    expect(read.data.title).toBe('A real paper');
    expect(read.verification?.fields).toEqual({});
  });

  it('cannot bring a paper into the cycle by changing its year', async () => {
    resolveMock.mockResolvedValue(hit(faculty, { values: { ...hit(faculty).values, year: '2019' } }));
    await expect(createRecord(
      faculty, 'publications', form(nextDoi(), { year: '2023', evidence: await evidence() }), 'submit',
    )).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('changing the year does not change that') });
  });

  it('lists records with points to check for DRIE', async () => {
    const list = await listRecords(drie, 'publications', { check: true, pageSize: 100 });
    expect(list.rows.length).toBeGreaterThan(0);
    expect(list.rows.every((r) => r.needsCheck)).toBe(true);
    const all = await listRecords(drie, 'publications', { pageSize: 100 });
    expect(all.total).toBeGreaterThan(list.total);       // the fully matching papers are left out
  });
});

describe('works that belong elsewhere', () => {
  const typed = (rawType: string, workType: string) => hit(faculty, {
    rawType, values: { ...hit(faculty).values, workType },
  });

  it('refuses a conference paper in Publications and points to Books & Chapters', async () => {
    resolveMock.mockResolvedValue(typed('proceedings-article', 'Conference paper'));
    await expect(createRecord(faculty, 'publications', form(nextDoi()), 'submit')).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('Add it under Books & Chapters'),
      fields: { doi: expect.stringContaining('conference paper') },
    });
  });

  it('refuses a preprint anywhere', async () => {
    resolveMock.mockResolvedValue(typed('posted-content', 'Preprint'));
    await expect(createRecord(faculty, 'publications', form(nextDoi()), 'submit'))
      .rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('peer review') });
  });

  it('accepts a conference paper in Books & Chapters', async () => {
    const doi = nextDoi();
    resolveMock.mockResolvedValue(hit(faculty, {
      rawType: 'proceedings-article',
      values: {
        doi, title: 'A conference paper', authors: `${faculty.name}, Someone Else`, year: '2023',
        workType: 'Conference paper', bookType: 'Conference paper', chapterTitle: 'A conference paper',
        bookTitle: '2023 International Conference on Testing', isbn: '9781509064717', publisher: 'IEEE',
        eventName: '2023 International Conference on Testing (ICT)',
      },
      identifiers: { issn: [], isbn: ['9781509064717'] },
    }));
    const { id } = await createRecord(faculty, 'books', {
      doi, publicationType: 'Conference paper', sameAffiliation: 'Yes', bookTitle: 'x', year: '2023',
      isbn: '9781509064717', publisher: 'x', bibliographic: 'x',
      evidence: (await uploadEvidence(faculty, {
        bytes: PDF, fileName: 'first-page.pdf', declaredMime: 'application/pdf', fieldKey: 'evidence', moduleKey: 'books',
      })).id,
    }, 'submit');
    const read = await getRecord(faculty, 'books', id);
    expect(read.data).toMatchObject({
      publicationType: 'Conference paper', chapterTitle: 'A conference paper',
      conferenceName: '2023 International Conference on Testing (ICT)',
    });
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
