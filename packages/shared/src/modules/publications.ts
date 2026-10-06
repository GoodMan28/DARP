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
    kind: 'doi', idFields: ['doi'], idLabel: 'DOI', autoApprove: true,
    acceptTypes: ['journal-article'],
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
      help: 'Filled in from the publisher\'s record. Add anyone missing (for example a name hidden behind "et al.") — but a record whose owner had to be added by hand is checked by DRIE.',
      exportAs: { faculty: 'Name of the author/s', drie: 'Name of the author/s' } },

    { key: 'journal', label: 'Name of journal', type: 'text', required: true, maxLength: 300,
      colSpan: 2, section: 'Journal', autofill: { from: 'containerTitle', locked: true },
      exportAs: { faculty: 'Name of journal', drie: 'Name of journal' } },

    { key: 'indexing', label: 'Indexing', type: 'select', required: true, listKey: 'indexingTypes',
      section: 'Journal', autofill: { from: 'indexing', locked: true },
      help: 'Taken from the Scopus and Web of Science journal lists IQAC loads each year.',
      exportAs: { faculty: 'Indexing', drie: 'Indexing' } },

    { key: 'year', label: 'Year of publication', type: 'year', required: true, min: 1960, max: 2100,
      section: 'Journal', autofill: { from: 'year', locked: true },
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
    { key: 'quartile', label: 'Journal quartile (SJR)', type: 'text', maxLength: 60, section: 'Journal',
      autofill: { from: 'quartile', locked: true, lockWhenEmpty: true },
      placeholder: 'Filled in from the SJR list IQAC loads — never typed by hand',
      help: 'Source: SCImago Journal Rank (scimagojr.com), the edition for the year of publication.' },

    { key: 'bibliographic',
      label: 'Bibliographic information of publication (Chicago reference style)',
      type: 'textarea', required: true, maxLength: 1200, colSpan: 2, section: 'Citation',
      autofill: { from: 'citation', locked: true },
      help: 'Generated from the details above in Chicago author-date style.',
      exportAs: {
        faculty: 'Bibliographic information of publication (Chicago reference style)',
        drie: 'Bibliographic information of publication (Chicago reference style)',
      } },
  ],
  listColumns: ['title', 'journal', 'quartile', 'year', 'doi'],
  defaultSort: { key: 'year', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Publications' },
    { workbook: 'drie', sheet: 'Publications' },
  ],
  feedsCounters: ['publications.count.cycle', 'publications.count.sinceJoining'],
};
