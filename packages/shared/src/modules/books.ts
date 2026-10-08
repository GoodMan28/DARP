// src/modules/books.ts
import type { ModuleConfig } from './_types';

export const books: ModuleConfig = {
  key: 'books',
  name: 'Books & Chapters',
  group: 'Research',
  periodType: 'CY',
  naacRef: '3.4',
  bodies: ['NAAC'],
  description: 'Books and chapters in edited volumes published during the cycle.',
  ownerRoles: ['faculty'],
  verifierRoles: ['drie'],
  viewRoles: ['hod', 'drie', 'admin'],
  scope: 'self',
  naturalKey: ['isbn', 'bookTitle', 'chapterTitle'],
  lookup: {
    kind: 'book', idFields: ['doi', 'isbn'], idLabel: 'DOI or ISBN', autoApprove: 'whenChecksPass',
    acceptTypes: ['book-chapter', 'book-part', 'book-section', 'reference-entry', 'book', 'edited-book', 'monograph', 'reference-book'],
  },
  fields: [
    { key: 'doi', label: 'DOI', type: 'doi', section: 'Publication',
      help: 'Chapters from Springer, Elsevier, Taylor & Francis, Wiley and IGI have a DOI — paste it above instead of the ISBN.',
      autofill: { from: 'doi', locked: true } },

    { key: 'publicationType', label: 'This entry is a', type: 'select', required: true,
      options: ['Book', 'Book chapter'], section: 'Publication',
      autofill: { from: 'bookType', locked: true },
      help: 'Books and chapters are counted separately on your profile.' },

    { key: 'bookTitle', label: 'Title of the book published', type: 'text', required: true,
      maxLength: 400, colSpan: 2, section: 'Publication',
      autofill: { from: 'bookTitle', locked: true },
      exportAs: { faculty: 'Title of the book published', drie: 'Title of the book published' } },

    { key: 'authors', label: 'Name of the author/s or editor/s', type: 'text', maxLength: 2000,
      colSpan: 2, section: 'Publication', autofill: { from: 'authors', locked: false },
      help: 'Filled in from the publisher\'s record. Add anyone missing — a record whose owner had to be added by hand is checked by DRIE.' },
    { key: 'pages', label: 'Pages', type: 'text', maxLength: 40, section: 'Publication',
      autofill: { from: 'pages', locked: true } },

    { key: 'chapterTitle', label: 'Title of the chapters published', type: 'text',
      maxLength: 400, colSpan: 2, section: 'Publication',
      showIf: { field: 'publicationType', in: ['Book chapter'] },
      autofill: { from: 'chapterTitle', locked: true },
      exportAs: { faculty: 'Title of the chapters  published', drie: 'Title of the chapters  published' } },

    { key: 'year', label: 'Year of publication', type: 'year', required: true, min: 1960, max: 2100,
      section: 'Publication', autofill: { from: 'year', locked: true },
      help: 'The year the book or proceedings volume was published (its print year). A chapter that appeared online earlier still counts in that year.',
      exportAs: {
        faculty: 'Year of publication (Data for calendar years 2024, 2023, 2022)',
        drie: 'Year of publication',
      } },

    { key: 'isbn', label: 'ISBN number', type: 'isbn', required: true, section: 'Publication',
      autofill: { from: 'isbn', locked: true },
      exportAs: { faculty: 'ISBN number', drie: 'ISBN number' } },

    { key: 'sameAffiliation',
      label: 'Whether at the time of publication Affiliating Institution was same Yes/No',
      type: 'select', required: true, options: ['Yes', 'No'], section: 'Publication',
      exportAs: {
        faculty: 'Whether at the time of publication Affiliating Institution  was same Yes/No',
        drie: 'Whether at the time of publication Affiliating Institution  was same Yes/No',
      } },

    { key: 'publisher', label: 'Name of the publisher', type: 'text', required: true,
      maxLength: 240, section: 'Publication',
      autofill: { from: 'publisher', locked: true },
      exportAs: { faculty: 'Name of the publisher', drie: 'Name of the publisher' } },

    { key: 'bibliographic',
      label: 'Bibliographic information of book/book chapter in Chicago reference style',
      type: 'textarea', required: true, maxLength: 1200, colSpan: 2, section: 'Citation',
      autofill: { from: 'citation', locked: true },
      help: 'Generated from the details above.',
      exportAs: {
        faculty: 'Bibliographic information of book/book chapter in Chicago reference style (Author 1, Author 2…"Chapter Name" In "Book Name", Page No., "Name of Publisher", Year of Publishing',
        drie: 'Bibliographic information of book/book chapter in Chicago reference style (Author 1, Author 2…"Chapter Name" In "Book Name", Page No., "Name of Publisher", Year of Publishing',
      } },

    { key: 'evidence', label: 'Attach documents', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      help: 'A link that opens directly to the book/chapter, or the first page as a PDF.',
      exportAs: {
        faculty: 'Attach documents (link that opens directly to book/book chapter or 1st page of book/book chapter in pdf)',
        drie: 'Attach documents (link that opens directly to book/book chapter or 1st page of book/book chapter in pdf)',
      } },
  ],
  listColumns: ['bookTitle', 'publicationType', 'year', 'isbn', 'publisher'],
  defaultSort: { key: 'year', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Books chaps.' },
    { workbook: 'drie', sheet: 'Books chaps.' },
  ],
  feedsCounters: [
    'books.count.book.cycle', 'books.count.book.sinceJoining',
    'books.count.chapter.cycle', 'books.count.chapter.sinceJoining',
  ],
};
