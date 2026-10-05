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
    'Research papers published in indexed journals. Enter each paper once — the DOI stops the same paper being entered twice.',
  ownerRoles: ['faculty'],
  verifierRoles: ['drie'],
  viewRoles: ['hod', 'drie', 'admin'],
  scope: 'self',
  naturalKey: ['doi'],
  fields: [
    { key: 'doi', label: 'Doi', type: 'doi', required: true, section: 'Paper',
      placeholder: 'https://doi.org/10.1016/j.ijpharm.2024.123793',
      help: 'In this format: https://doi.org/10.1016/j.ijpharm.2024.123793. Checked against existing records to block duplicates.',
      exportAs: {
        faculty: 'Doi (In this format: https://doi.org/10.1016/j.ijpharm.2024.123793)',
        drie: 'Doi (In this format: https://doi.org/10.1016/j.ijpharm.2024.123793)',
      } },

    { key: 'title', label: 'Paper title', type: 'text', required: true, maxLength: 400,
      colSpan: 2, section: 'Paper',
      help: 'Used in your record list and in the NAAC annexure. The workbook itself carries only the full citation.' },

    { key: 'authors', label: 'Name of the author/s', type: 'text', required: true,
      maxLength: 400, colSpan: 2, section: 'Paper',
      placeholder: 'A. K. Verma, S. Mahato, P. Ranjan',
      help: 'List all authors in publication order.',
      exportAs: { faculty: 'Name of the author/s', drie: 'Name of the author/s' } },

    { key: 'journal', label: 'Name of journal', type: 'text', required: true, maxLength: 300,
      colSpan: 2, section: 'Journal',
      exportAs: { faculty: 'Name of journal', drie: 'Name of journal' } },

    { key: 'indexing', label: 'Indexing', type: 'select', required: true, listKey: 'indexingTypes',
      section: 'Journal', help: 'Dropdown maintained by IQAC.',
      exportAs: { faculty: 'Indexing', drie: 'Indexing' } },

    { key: 'year', label: 'Year of publication', type: 'year', required: true, min: 1960, max: 2100,
      section: 'Journal',
      exportAs: {
        faculty: 'Year of publication (starting from latest calendar year 2024, 2023, 2022)',
        drie: 'Year of publication',
      } },

    { key: 'issn', label: 'ISSN number of Journal', type: 'issn', section: 'Journal',
      placeholder: '0167-739X',
      exportAs: { faculty: 'ISSN number of Journal', drie: 'ISSN number of Journal' } },

    { key: 'bibliographic',
      label: 'Bibliographic information of publication (Chicago reference style)',
      type: 'textarea', required: true, maxLength: 1200, colSpan: 2, section: 'Citation',
      help: 'Paste the citation as it appears in the journal. Used verbatim in the NAAC annexure.',
      exportAs: {
        faculty: 'Bibliographic information of publication (Chicago reference style)',
        drie: 'Bibliographic information of publication (Chicago reference style)',
      } },
  ],
  listColumns: ['title', 'journal', 'indexing', 'year', 'doi'],
  defaultSort: { key: 'year', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Publications' },
    { workbook: 'drie', sheet: 'Publications' },
  ],
  feedsCounters: ['publications.count.cycle', 'publications.count.sinceJoining'],
};
