import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import {
  createRecord, updateRecord, getRecord, transitionRecord, listRecords, correctionsFor, acknowledgeCorrection,
} from '@/server/records/service';
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
  year: '2023',
  issn: '2168-7161',
  bibliographic: 'typed citation',
  affiliatedToBit: 'Yes',
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
    resolveMock.mockResolvedValue(hit(faculty, { flags: ['retracted'] }));
    const { id, status } = await createRecord(
      faculty, 'publications', form(nextDoi(), { evidence: await evidence() }), 'submit',
    );
    expect(status).toBe('approved');
    const read = await getRecord(faculty, 'publications', id);
    expect(read.verification?.autoApproved).toBe(true);
    expect(read.verification?.reasons.join(' ')).toContain('retracted');
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
  it('falls back to typed details when the register is unavailable, approved with evidence', async () => {
    // Thrown synchronously inside the awaited call: same try/catch path as a rejected promise.
    resolveMock.mockImplementation(() => { throw new LookupUnavailable('down'); });
    const { id, status } = await createRecord(
      faculty, 'publications',
      form(nextDoi(), { authors: faculty.name, evidence: await evidence() }), 'submit',
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
  it('asks for evidence in Books, Chapters & Conference Papers even when everything matches', async () => {
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

  it('offers Books, Chapters & Conference Papers for a conference paper', async () => {
    resolveMock.mockResolvedValue(hit(faculty, { rawType: 'proceedings-article', values: { ...hit(faculty).values, workType: 'Conference paper' } }));
    const res = await lookupForForm(faculty, 'publications', nextDoi());
    expect(res.moveTo).toEqual({ moduleKey: 'books', name: 'Books, Chapters & Conference Papers' });
  });
});

describe("papers from years outside the cycle's window", () => {
  const old = () => hit(faculty, { values: { ...hit(faculty).values, year: '2019' } });

  it('are accepted like any other paper and filed under their own year', async () => {
    resolveMock.mockResolvedValue(old());
    const { id, status } = await createRecord(
      faculty, 'publications', form(nextDoi(), { year: '2019', evidence: await evidence() }), 'submit',
    );
    expect(status).toBe('approved');
    const read = await getRecord(faculty, 'publications', id);
    expect(read.periodLabel).toBe('2019');
    expect(read.verification?.reasons).toEqual([]);   // the year is never a point to check
  });

  it('can be picked by year in the list', async () => {
    const list = await listRecords(drie, 'publications', { periodYear: 2019, pageSize: 100 });
    expect(list.rows.length).toBeGreaterThan(0);
    expect(list.rows.every((r) => r.periodYear === 2019)).toBe(true);
  });

  it('accepts a book or chapter from any year as well', async () => {
    resolveMock.mockImplementation(() => { throw new LookupUnavailable('down'); });
    const { id } = await createRecord(faculty, 'books', {
      isbn: '9781509064717', publicationType: 'Book', sameAffiliation: 'Yes', bookTitle: 'An old book',
      authors: faculty.name, year: '2020', publisher: 'x', bibliographic: 'x', evidence: await evidence('books'),
    }, 'submit');
    expect((await getRecord(faculty, 'books', id)).periodLabel).toBe('2020');
  });
});

describe('the owner may change a fetched detail; DRIE and IQAC see the change', () => {
  it('keeps the changed value, records the publisher\x27s, and makes it a point to check', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { id, status } = await createRecord(
      faculty, 'publications',
      form(nextDoi(), { title: 'A real paper', journal: 'Real Journal of Things', evidence: await evidence() }), 'submit',
    );
    expect(status).toBe('approved');                     // still approved on submission
    const read = await getRecord(drie, 'publications', id);
    expect(read.data.journal).toBe('Real Journal of Things');
    expect(read.verification?.fields).toEqual({ journal: { origin: 'changed', fetched: 'Real Journal' } });
    expect(read.verification?.reasons.join(' ')).toContain('Name of journal was changed by the faculty member');
    expect(read.lockedFields).not.toContain('journal');  // shown open on the form, with the publisher's value
    expect(read.lockedFields).toContain('issn');
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

  it('records a changed year as a change, and files the record under the year it was given', async () => {
    resolveMock.mockResolvedValue(hit(faculty, { values: { ...hit(faculty).values, year: '2019' } }));
    const { id } = await createRecord(
      faculty, 'publications', form(nextDoi(), { year: '2023', evidence: await evidence() }), 'submit',
    );
    const read = await getRecord(drie, 'publications', id);
    expect(read.verification?.fields?.year).toEqual({ origin: 'changed', fetched: '2019' });
    expect(read.periodLabel).toBe('2023');
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

  it('refuses a conference paper in Publications and points to Books, Chapters & Conference Papers', async () => {
    resolveMock.mockResolvedValue(typed('proceedings-article', 'Conference paper'));
    await expect(createRecord(faculty, 'publications', form(nextDoi()), 'submit')).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('Add it under Books, Chapters & Conference Papers'),
      fields: { doi: expect.stringContaining('conference paper') },
    });
  });

  it('refuses a preprint anywhere', async () => {
    resolveMock.mockResolvedValue(typed('posted-content', 'Preprint'));
    await expect(createRecord(faculty, 'publications', form(nextDoi()), 'submit'))
      .rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('peer review') });
  });

  it('accepts a conference paper in Books, Chapters & Conference Papers', async () => {
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
  it('DRIE can return an approved publication; the corrected one is approved again and flagged for DRIE', async () => {
    resolveMock.mockResolvedValue(hit(faculty, { flags: ['retracted'] }));
    const ev = await evidence();
    const doi = nextDoi();
    const { id, status } = await createRecord(faculty, 'publications', form(doi, { evidence: ev }), 'submit');
    expect(status).toBe('approved');

    const back = await transitionRecord(drie, 'publications', id, 'return', 'The indexing is not Scopus.');
    expect(back.status).toBe('returned');

    const again = await updateRecord(faculty, 'publications', id, form(doi, { evidence: ev }), 'submit');
    expect(again.status).toBe('approved');                  // approved again, with nobody in between
    expect((await correctionsFor(drie)).map((c) => c.id)).toContain(id);   // but DRIE is told to look
    await acknowledgeCorrection(drie, 'publications', id);
    expect((await correctionsFor(drie)).map((c) => c.id)).not.toContain(id);
  });

  it('a draft is never approved, even when everything matches', async () => {
    resolveMock.mockResolvedValue(hit(faculty));
    const { status } = await createRecord(faculty, 'publications', form(nextDoi()), 'draft');
    expect(status).toBe('draft');
  });
});

describe('books, chapters and conference papers follow the same flow as publications', () => {
  /** A Crossref chapter that names the signed-in faculty member. */
  const chapter = (doi: string, over: Partial<LookupResult> = {}) => hit(faculty, {
    rawType: 'book-chapter',
    values: {
      doi, authors: `${faculty.name}, Someone Else`, year: '2023', workType: 'Book chapter', bookType: 'Book chapter',
      chapterTitle: `A chapter ${doi}`, bookTitle: 'A book', isbn: '9781509064717', publisher: 'Springer', pages: '1-10',
    },
    identifiers: { issn: [], isbn: ['9781509064717'] },
    ...over,
  });
  const bookForm = async (doi: string, over: Record<string, unknown> = {}) => ({
    doi, publicationType: 'Book chapter', sameAffiliation: 'Yes', bookTitle: 'A book', year: '2023',
    isbn: '9781509064717', publisher: 'Springer', bibliographic: 'x', evidence: await evidence('books'), ...over,
  });

  it('approves a fully confirmed chapter on submission, with nothing to check', async () => {
    const doi = nextDoi();
    resolveMock.mockResolvedValue(chapter(doi));
    const { id, status } = await createRecord(faculty, 'books', await bookForm(doi), 'submit');
    expect(status).toBe('approved');
    const read = await getRecord(faculty, 'books', id);
    expect(read.verification).toMatchObject({ autoApproved: true, reasons: [] });
    expect(read.history[read.history.length - 1]!.actorName).toBe('DARP automatic check');
  });

  it('approves an entry typed by hand too (no DOI or ISBN found), listing it as a point to check', async () => {
    resolveMock.mockResolvedValue(notFound());
    const { id, status } = await createRecord(
      faculty, 'books', await bookForm('', { isbn: '9788120340077', authors: faculty.name, chapterTitle: 'Typed' }), 'submit',
    );
    expect(status).toBe('approved');
    const read = await getRecord(drie, 'books', id);
    expect(read.verification?.reasons.join(' ')).toContain('typed by hand');
    expect((await listRecords(drie, 'books', { check: true, pageSize: 100 })).rows.map((r) => r.id)).toContain(id);
  });

  it('refuses to submit when the owner is not among the authors or editors', async () => {
    const doi = nextDoi();
    resolveMock.mockResolvedValue(chapter(doi, {
      values: { ...chapter(doi).values, authors: 'Anil Sharma' },
      people: [{ given: 'Anil', family: 'Sharma', full: 'Anil Sharma', orcid: null, bitAffiliated: true }],
    }));
    await expect(createRecord(faculty, 'books', await bookForm(doi), 'submit'))
      .rejects.toMatchObject({ code: 'VALIDATION', fields: { authors: expect.stringContaining('must be in the author list') } });
  });

  it('says on Fetch details that the entry is approved when submitted, even with a point to check', async () => {
    const doi = nextDoi();
    resolveMock.mockResolvedValue(chapter(doi, { flags: ['parent-book-not-found'] }));
    const notes = (await lookupForForm(faculty, 'books', doi)).notes.join(' ');
    expect(notes).toContain('The book this chapter belongs to could not be found');
    expect(notes).toContain('the record is approved when you submit');
  });

  it('DRIE can return an approved entry; the corrected one is approved again', async () => {
    const doi = nextDoi();
    resolveMock.mockResolvedValue(chapter(doi));
    const values = await bookForm(doi);
    const { id, status } = await createRecord(faculty, 'books', values, 'submit');
    expect(status).toBe('approved');
    expect((await transitionRecord(drie, 'books', id, 'return', 'Wrong book.')).status).toBe('returned');
    expect((await updateRecord(faculty, 'books', id, values, 'submit')).status).toBe('approved');
  });
});
