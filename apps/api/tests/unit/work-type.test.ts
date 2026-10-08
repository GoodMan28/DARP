import { describe, it, expect } from 'vitest';
import { workTypeNote, yearNote } from '@/server/lookup/apply';
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
