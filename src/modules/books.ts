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
  fields: [
    { key: 'publicationType', label: 'This entry is a', type: 'select', required: true,
      options: ['Book', 'Book chapter'], section: 'Publication',
      help: 'Books and chapters are counted separately on your profile.' },

    { key: 'bookTitle', label: 'Title of the book published', type: 'text', required: true,
      maxLength: 400, colSpan: 2, section: 'Publication',
      exportAs: { faculty: 'Title of the book published', drie: 'Title of the book published' } },

    { key: 'chapterTitle', label: 'Title of the chapters published', type: 'text',
      maxLength: 400, colSpan: 2, section: 'Publication',
      showIf: { field: 'publicationType', in: ['Book chapter'] },
      exportAs: { faculty: 'Title of the chapters  published', drie: 'Title of the chapters  published' } },

    { key: 'year', label: 'Year of publication', type: 'year', required: true, min: 1960, max: 2100,
      section: 'Publication',
      exportAs: {
        faculty: 'Year of publication (Data for calendar years 2024, 2023, 2022)',
        drie: 'Year of publication',
      } },

    { key: 'isbn', label: 'ISBN number', type: 'isbn', required: true, section: 'Publication',
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
      exportAs: { faculty: 'Name of the publisher', drie: 'Name of the publisher' } },

    { key: 'bibliographic',
      label: 'Bibliographic information of book/book chapter in Chicago reference style',
      type: 'textarea', required: true, maxLength: 1200, colSpan: 2, section: 'Citation',
      help: 'Author 1, Author 2… "Chapter Name" In "Book Name", Page No., "Name of Publisher", Year of Publishing.',
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
