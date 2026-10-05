// src/modules/riawards.ts
import type { ModuleConfig } from './_types';

export const riawards: ModuleConfig = {
  key: 'riawards',
  name: 'Research & Innovation Awards',
  group: 'Research',
  periodType: 'CY',
  naacRef: '3.3.2',
  bodies: ['NAAC'],
  description:
    'Awards for research or innovation only. Awards recorded in Awards & Recognition or Awards for Extension Activities must not be repeated here.',
  ownerRoles: ['faculty'],
  verifierRoles: ['drie'],
  viewRoles: ['hod', 'drie', 'admin'],
  scope: 'self',
  naturalKey: ['awardName', 'awardYear', 'awardeeName'],
  fields: [
    { key: 'awardeeName', label: 'Name of the awardee', type: 'text', required: true,
      maxLength: 240, section: 'Award',
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

    { key: 'awardYear', label: 'Year of award', type: 'year', required: true, min: 1990, max: 2100,
      section: 'Award',
      exportAs: {
        faculty: 'Year of award (starting from latest calendar year) (data for 2024, 2023, 2022)',
        drie: 'Year of award (starting from latest calendar year)',
        hod: 'Year of award (starting from latest calendar year) (data for 2024, 2023, 2022)',
      } },

    { key: 'awardeeCategory', label: 'Category of Awardee', type: 'select', required: true,
      listKey: 'riAwardeeCategories', section: 'Award',
      exportAs: {
        faculty: 'Category of Awardee (Institution/teacher)',
        drie: 'Category of Awardee (Institution/teacher/research scholar/student)',
        hod: 'Category of Awardee (Institution//research scholar/student)',
      } },

    { key: 'evidence', label: 'Attach documents (Award letters)', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      exportAs: {
        faculty: 'Attach documents  (Award letters)', drie: 'Attach documents  (Award letters)',
        hod: 'Attach documents  (Award letters)',
      } },
  ],
  listColumns: ['awardName', 'awardeeName', 'awardingBody', 'awardCategory', 'awardYear'],
  defaultSort: { key: 'awardYear', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Rsrch.&Innov. Award' },
    { workbook: 'drie', sheet: 'Rsrch.&Innov. Award' },
    { workbook: 'hod', sheet: 'Rsrch.&Innov. Award' },
  ],
  feedsCounters: ['riawards.count.cycle', 'riawards.count.sinceJoining'],
};
