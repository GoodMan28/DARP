// src/modules/publications.ts
import type { ModuleConfig } from './_types';

export const publications: ModuleConfig = {
  key: 'publications',
  name: 'Publications',
  group: 'Research',
  periodType: 'CY',
  naacRef: '3.4',
  bodies: ['NAAC', 'NIRF', 'QS'],
  description:
    'Research papers published in journals. Paste the DOI and press Fetch details — the paper\'s details are filled in from the publisher\'s record. Each paper is entered once.',
  ownerRoles: ['faculty'],
  verifierRoles: ['drie'],
  viewRoles: ['hod', 'drie', 'admin'],
  scope: 'self',
  naturalKey: ['doi'],
  lookup: {
    kind: 'doi', idFields: ['doi'], idLabel: 'DOI',
    // Thousands of papers a year: approved on submission, spot-checked afterwards by DRIE/IQAC.
    autoApprove: 'always',
    acceptTypes: ['journal-article'],
    // Conference papers, chapters and books are entered under Books & Chapters; preprints nowhere.
    elsewhere: [
      {
        types: ['proceedings-article', 'book-chapter', 'book-part', 'book-section', 'reference-entry',
          'book', 'edited-book', 'monograph', 'reference-book'],
        moduleKey: 'books',
      },
      { types: ['posted-content'], moduleKey: null },
    ],
    ownerMustBeIn: 'authors',
    evidenceField: 'evidence',
    // A paper from another year belongs to another cycle; never count it in this one.
    refuseOutsideCycle: true,
  },
  fields: [
    { key: 'doi', label: 'Doi', type: 'doi', required: true, section: 'Paper',
      placeholder: 'https://doi.org/10.1016/j.ijpharm.2024.123793',
      help: 'Paste the DOI (for example 10.1016/j.future.2026.107812 or the full https://doi.org/… link) into the box above and press Fetch details.',
      exportAs: {
        faculty: 'Doi (In this format: https://doi.org/10.1016/j.ijpharm.2024.123793)',
        drie: 'Doi (In this format: https://doi.org/10.1016/j.ijpharm.2024.123793)',
      } },

    { key: 'title', label: 'Paper title', type: 'text', required: true, maxLength: 400,
      colSpan: 2, section: 'Paper', autofill: { from: 'title', locked: true },
      help: 'Used in your record list and in the NAAC annexure. The workbook itself carries only the full citation.' },

    { key: 'authors', label: 'Name of the author/s', type: 'text', required: true,
      maxLength: 2000, colSpan: 2, section: 'Paper',
      placeholder: 'A. K. Verma, S. Mahato, P. Ranjan',
      autofill: { from: 'authors', locked: false },
      help: 'Filled in from the publisher\'s record. Your own name must be in this list before you can submit — add it if it is hidden (for example behind "et al."), and attach evidence.',
      exportAs: { faculty: 'Name of the author/s', drie: 'Name of the author/s' } },

    { key: 'journal', label: 'Name of journal', type: 'text', required: true, maxLength: 300,
      colSpan: 2, section: 'Journal', autofill: { from: 'containerTitle', locked: true },
      exportAs: { faculty: 'Name of journal', drie: 'Name of journal' } },

    { key: 'indexing', label: 'Indexing', type: 'select', required: true, listKey: 'indexingTypes',
      section: 'Journal', autofill: { from: 'indexing', locked: true },
      help: 'Filled in from the Scopus list (and any Web of Science list IQAC loads). If it could not be found, choose it yourself and attach evidence.',
      exportAs: { faculty: 'Indexing', drie: 'Indexing' } },

    { key: 'year', label: 'Year of publication', type: 'year', required: true, min: 1960, max: 2100,
      section: 'Journal', autofill: { from: 'year', locked: true },
      help: 'The year of the journal issue the paper appeared in. A paper published online earlier still counts in its issue year; one not yet in an issue counts in the year it appeared online.',
      exportAs: {
        faculty: 'Year of publication (starting from latest calendar year 2024, 2023, 2022)',
        drie: 'Year of publication',
      } },

    { key: 'issn', label: 'ISSN number of Journal', type: 'issn', section: 'Journal',
      placeholder: '0167-739X', autofill: { from: 'issn', locked: true },
      exportAs: { faculty: 'ISSN number of Journal', drie: 'ISSN number of Journal' } },

    { key: 'volume', label: 'Volume', type: 'text', maxLength: 40, section: 'Journal',
      autofill: { from: 'volume', locked: true } },
    { key: 'issue', label: 'Issue', type: 'text', maxLength: 40, section: 'Journal',
      autofill: { from: 'issue', locked: true } },
    { key: 'pages', label: 'Pages / article number', type: 'text', maxLength: 40, section: 'Journal',
      autofill: { from: 'pages', locked: true } },
    { key: 'quartile', label: 'Journal quartile (SJR)', type: 'select', section: 'Journal',
      options: ['Q1', 'Q2', 'Q3', 'Q4', 'Not ranked'],
      autofill: { from: 'quartile', locked: true },
      help: 'Filled in from SCImago Journal Rank data. If it could not be found, choose it yourself and attach evidence.' },
    { key: 'quartileSource', label: 'Quartile source', type: 'text', maxLength: 90, section: 'Journal',
      autofill: { from: 'quartileSource', locked: true, alwaysLocked: true, describes: 'quartile' },
      help: 'Where the quartile came from, e.g. "SJR 2025 · SCImago". Says so when you chose or changed it yourself.' },

    { key: 'bibliographic',
      label: 'Bibliographic information of publication (Chicago reference style)',
      type: 'textarea', required: true, maxLength: 1200, colSpan: 2, section: 'Citation',
      autofill: { from: 'citation', locked: true },
      help: 'Generated from the details above in Chicago author-date style.',
      exportAs: {
        faculty: 'Bibliographic information of publication (Chicago reference style)',
        drie: 'Bibliographic information of publication (Chicago reference style)',
      } },

    { key: 'evidence', label: 'Evidence (first page of the paper, or the acceptance letter)', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      required: true,
      help: 'Required for every paper. DRIE and IQAC check it against the details above — especially anything you changed or typed yourself.' },
  ],
  listColumns: ['title', 'journal', 'quartile', 'year', 'doi'],
  defaultSort: { key: 'year', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Publications' },
    { workbook: 'drie', sheet: 'Publications' },
  ],
  feedsCounters: ['publications.count.cycle', 'publications.count.sinceJoining'],
};
