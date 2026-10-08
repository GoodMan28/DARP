import { describe, it, expect } from 'vitest';
import { workTypeNote, yearNote, misplacedWork } from '@/server/lookup/apply';
import { notFound, type LookupResult } from '@/server/lookup/types';
import { MODULES } from '@darp/shared/modules';

const pubs = MODULES.publications!;
const books = MODULES.books!;
const work = (rawType: string, workType: string): LookupResult => ({
  ...notFound(), found: true, source: 'crossref', authoritative: true, rawType,
  values: { doi: '10.2991/978-94-6239-799-6', workType },
});

describe('workTypeNote', () => {
  it('explains that a whole proceedings volume is not a paper, and how to find the paper\'s DOI', () => {
    // The real case: 10.2991/978-94-6239-799-6 is the ICETTACS 2026 volume, typed "book" in Crossref.
    const note = workTypeNote(pubs, work('book', 'Book'));
    expect(note).toContain('whole book or conference proceedings volume');
    expect(note).toContain('10.2991/978-94-6239-799-6_6');
  });

  it('names a conference paper as such', () => {
    expect(workTypeNote(pubs, work('proceedings-article', 'Conference paper'))).toContain('"Conference paper"');
  });

  it('says nothing for an accepted type, or where whole books are what the module takes', () => {
    expect(workTypeNote(pubs, work('journal-article', 'Journal article'))).toBeNull();
    expect(workTypeNote(books, work('book', 'Book'))).toBeNull();
  });
});

describe('yearNote', () => {
  const dated = (year: string, onlineYear: string): LookupResult => ({
    ...notFound(), found: true, source: 'crossref', authoritative: true, rawType: 'journal-article',
    values: { year, onlineYear },
  });

  it('says the issue year counts when the paper was online in an earlier year', () => {
    expect(yearNote(dated('2022', '2021'))).toBe(
      'It was published online in 2021 and in an issue in 2022. The issue year, 2022, is the year that counts.',
    );
  });

  it('says nothing when the years agree or one is unknown', () => {
    expect(yearNote(dated('2023', '2023'))).toBeNull();
    expect(yearNote(dated('2023', ''))).toBeNull();
  });
});

describe('misplacedWork', () => {
  it('sends a conference paper or a chapter from Publications to Books & Chapters', () => {
    const conf = misplacedWork(pubs, work('proceedings-article', 'Conference paper'));
    expect(conf).toMatchObject({ field: 'doi', moveTo: 'books' });
    expect(conf?.message).toContain('This DOI is a conference paper, not a journal article');
    expect(misplacedWork(pubs, work('book-chapter', 'Book chapter'))?.moveTo).toBe('books');
  });

  it('explains a whole volume first, then offers Books & Chapters for a book the owner wrote', () => {
    const note = misplacedWork(pubs, work('book', 'Book'))?.message ?? '';
    expect(note).toContain('whole book or conference proceedings volume');
    expect(note).toContain('If it is a book you wrote or edited, add it under Books & Chapters');
  });

  it('refuses a preprint everywhere, with nowhere to move it', () => {
    expect(misplacedWork(pubs, work('posted-content', 'Preprint'))).toMatchObject({ moveTo: null });
    expect(misplacedWork(books, work('posted-content', 'Preprint'))?.message).toContain('peer review');
  });

  it('sends a journal article from Books & Chapters to Publications, and keeps what belongs', () => {
    expect(misplacedWork(books, work('journal-article', 'Journal article'))?.moveTo).toBe('publications');
    expect(misplacedWork(pubs, work('journal-article', 'Journal article'))).toBeNull();
    expect(misplacedWork(books, work('proceedings-article', 'Conference paper'))).toBeNull();
  });
});
