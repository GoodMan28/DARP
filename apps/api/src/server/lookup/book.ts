import type { LookupResult, Person } from './types';
import { notFound } from './types';
import { getJson, MAILTO } from './http';
import { clean, encodePath } from './text';
import { fromCrossref, isbnsOf, toPerson, type CrossrefWork } from './crossref';
import { normaliseDoiInput } from './doi';
import { isbn13 } from './isbn';

const BOOK_TYPES = new Set(['book', 'edited-book', 'monograph', 'reference-book']);
const CHAPTER_TYPES = new Set(['book-chapter', 'book-part', 'book-section', 'reference-entry']);

async function crossrefWork(doi: string): Promise<CrossrefWork | null> {
  const res = (await getJson(
    `https://api.crossref.org/works/${encodePath(doi)}?mailto=${encodeURIComponent(MAILTO)}`,
  )) as { message?: CrossrefWork } | null;
  return res?.message ?? null;
}

/** The parent book of an ISBN. Crossref matches the exact 13-digit string only. */
async function bookByIsbn(isbns: string[]): Promise<CrossrefWork | null> {
  for (const i of isbns) {
    const res = (await getJson(
      `https://api.crossref.org/works?filter=isbn:${i},type:book,type:edited-book,type:monograph,type:reference-book&rows=1&mailto=${encodeURIComponent(MAILTO)}`,
    )) as { message?: { items?: CrossrefWork[] } } | null;
    const item = res?.message?.items?.[0];
    if (item) return item;
  }
  return null;
}

function bookResult(w: CrossrefWork, parent: CrossrefWork | null, isChapter: boolean): LookupResult {
  const r = fromCrossref(w);
  const book = isChapter ? parent : w;
  const containers = w['container-title'] ?? [];
  // A chapter's container-title is often [series, book]: the LAST entry is the book.
  r.values.bookTitle = book ? clean(book.title?.[0]) : clean(containers[containers.length - 1]);
  r.values.chapterTitle = isChapter ? clean(w.title?.[0]) : '';
  r.values.bookType = isChapter ? 'Book chapter' : 'Book';
  r.values.isbn = (book ? isbnsOf(book) : [])[0] ?? isbnsOf(w)[0] ?? '';
  r.values.publisher = clean((book ?? w).publisher);
  if (!isChapter && (w.author ?? []).length === 0) {
    const editors: Person[] = (w.editor ?? []).map(toPerson);
    r.people = editors;
    r.values.authors = editors.map((p) => `${p.full} (ed.)`).join(', ');
  }
  if (isChapter && !parent) r.flags.push('parent-book-not-found');
  return r;
}

interface OpenLibraryBook {
  title?: string; subtitle?: string; publish_date?: string;
  authors?: Array<{ name?: string }>; publishers?: Array<{ name?: string }>;
}

/** Open Library: suggestions only (authoritative: false), so nothing is locked or auto-approved. */
async function openLibrary(isbn: string): Promise<LookupResult | null> {
  const res = (await getJson(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`,
  )) as Record<string, OpenLibraryBook> | null;
  const b = res?.[`ISBN:${isbn}`];
  if (!b) return null;
  const people: Person[] = (b.authors ?? []).map((a) => ({
    given: '', family: '', full: clean(a.name), orcid: null, bitAffiliated: null,
  }));
  return {
    found: true,
    source: 'openlibrary',
    authoritative: false,
    rawType: 'book',
    values: {
      bookType: 'Book',
      bookTitle: clean([b.title, b.subtitle].filter(Boolean).join(': ')),
      isbn,
      publisher: clean(b.publishers?.[0]?.name),
      year: b.publish_date?.match(/\d{4}/)?.[0] ?? '',
      authors: people.map((p) => p.full).join(', '),
    },
    people,
    identifiers: { issn: [], isbn: [isbn] },
    flags: [],
    fetchedAt: new Date().toISOString(),
  };
}

/** A DOI (chapter or book) or an ISBN (book). */
export async function resolveBook(raw: string): Promise<LookupResult> {
  const doi = normaliseDoiInput(raw);
  if (doi) {
    const w = await crossrefWork(doi);
    if (!w) return notFound();
    const type = w.type ?? '';
    const isChapter = CHAPTER_TYPES.has(type)
      || (type === 'other' && /\.ch\d+$/i.test(w.DOI) && isbnsOf(w).length > 0);   // Wiley
    if (!isChapter && !BOOK_TYPES.has(type)) {
      const r = fromCrossref(w);
      r.flags.push('not-a-book');
      return r;
    }
    const parent = isChapter ? await bookByIsbn(isbnsOf(w)) : null;
    return bookResult(w, parent, isChapter);
  }
  const isbn = isbn13(raw);
  if (!isbn) return notFound();
  const book = await bookByIsbn([isbn]);
  if (book) return bookResult(book, null, false);
  return (await openLibrary(isbn)) ?? notFound();
}
