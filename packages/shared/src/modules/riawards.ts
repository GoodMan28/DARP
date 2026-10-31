// src/modules/riawards.ts
import type { ModuleConfig } from './_types';
import { FACULTY_MEMBERS } from './_types';

export const riawards: ModuleConfig = {
  key: 'riawards',
  name: 'Research & Innovation Awards',
  group: 'Research',
  periodType: 'CY',
  naacRef: '3.3.2',
  bodies: ['NAAC'],
  description:
    'Awards for research or innovation only. Awards recorded in Awards & Recognition or Awards for Extension Activities must not be repeated here.',
  ownerRoles: FACULTY_MEMBERS,
  verifierRoles: ['drie'],
  viewRoles: ['hod', 'drie', 'admin'],
  scope: 'self',
  naturalKey: ['awardName', 'awardDate', 'awardeeName'],
  fields: [
    { key: 'awardeeName', label: 'Name of the awardee', type: 'text', required: true,
      maxLength: 240, section: 'Award', prefill: 'ownerName',
      exportAs: {
        faculty: 'Name of the awardee', drie: 'Name of the awardee', hod: 'Name of the awardee',
      } },

    { key: 'awardName', label: 'Name of the award', type: 'text', required: true, maxLength: 300,
      colSpan: 2, section: 'Award',
      exportAs: {
        faculty: 'Name of the award', drie: 'Name of the award', hod: 'Name of the award',
      } },

    { key: 'awardingBody', label: 'Name of the awarding body', type: 'text', required: true,
      maxLength: 240, section: 'Award',
      exportAs: {
        faculty: 'Name of the awarding body', drie: 'Name of the awarding body',
        hod: 'Name of the awarding body',
      } },

    { key: 'awardCategory', label: 'Category of award', type: 'select', required: true,
      listKey: 'riAwardCategories', section: 'Award',
      help: 'Innovation, technology transfer and similar.',
      exportAs: {
        faculty: 'Category of award (innovation/techology transfer etc)',
        drie: 'Category of award (innovation/techology transfer etc)',
        hod: 'Category of award (innovation/techology transfer etc)',
      } },

    { key: 'awardDate', label: 'Date of award', type: 'date', required: true,
      notFuture: true, periodSource: true, exportYear: true, section: 'Award', help: 'The date of the award letter.',
      exportAs: {
        faculty: 'Year of award (starting from latest calendar year) (data for 2024, 2023, 2022)',
        drie: 'Year of award (starting from latest calendar year)',
        hod: 'Year of award (starting from latest calendar year) (data for 2024, 2023, 2022)',
      } },

    { key: 'validityYears', label: 'Validity (in years)', type: 'decimal', required: true, min: 0.5, max: 100,
      unit: 'years', placeholder: '3', section: 'Award', showIf: { field: 'validForLife', in: ['', 'false'] },
      help: 'How long the award stands from the date of award, for example 1, 2 or 5. A number only.',
      exportAs: { faculty: 'Validity (years)', drie: 'Validity (years)', hod: 'Validity (years)' } },

    { key: 'validForLife', label: 'Valid for life', type: 'checkbox', section: 'Award',
      help: 'Tick this if the award never expires. The number of years is then not asked for.',
      exportAs: { faculty: 'Valid for life', drie: 'Valid for life', hod: 'Valid for life' } },

    { key: 'awardeeCategory', label: 'Category of Awardee', type: 'select', required: true,
      listKey: 'riAwardeeCategories', section: 'Award',
      exportAs: {
        faculty: 'Category of Awardee (Institution/teacher)',
        drie: 'Category of Awardee (Institution/teacher/research scholar/student)',
        hod: 'Category of Awardee (Institution//research scholar/student)',
      } },

    { key: 'evidence', label: 'Attach documents (Award letters)', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 2, colSpan: 2, section: 'Evidence',
      exportAs: {
        faculty: 'Attach documents  (Award letters)', drie: 'Attach documents  (Award letters)',
        hod: 'Attach documents  (Award letters)',
      } },
  ],
  derived: [{ key: 'validUntil', label: 'Valid until', exportAs: { faculty: 'Valid until', drie: 'Valid until', hod: 'Valid until' } }],
  listColumns: ['awardName', 'awardeeName', 'awardingBody', 'awardCategory', 'awardDate', 'validUntil'],
  defaultSort: { key: 'awardDate', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Rsrch.&Innov. Award' },
    { workbook: 'drie', sheet: 'Rsrch.&Innov. Award' },
    { workbook: 'hod', sheet: 'Rsrch.&Innov. Award' },
  ],
  feedsCounters: ['riawards.count.cycle', 'riawards.count.sinceJoining', 'riawards.count.active'],
};
