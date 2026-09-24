// src/modules/fellowships.ts
import type { ModuleConfig } from './_types';

export const fellowships: ModuleConfig = {
  key: 'fellowships',
  name: 'Fellowships & Travel Grants',
  group: 'Research',
  periodType: 'FY',
  naacRef: '3.1',
  bodies: ['NAAC'],
  description:
    'National and international fellowships, financial support for advanced study or research, and sponsored international travel grants.',
  ownerRoles: ['faculty'],
  verifierRoles: ['drie'],
  viewRoles: ['hod', 'drie', 'admin'],
  scope: 'self',
  naturalKey: ['name', 'awardYear'],
  fields: [
    { key: 'supportType', label: 'Type of support', type: 'select', required: true,
      listKey: 'fellowshipTypes', section: 'Support',
      exportAs: { faculty: 'Type of support', drie: 'Type of support' } },

    { key: 'name',
      label: 'Name of the national/ international fellowship/financial support /international travel grant',
      type: 'text', required: true, maxLength: 300, colSpan: 2, section: 'Support',
      exportAs: {
        faculty: 'Name of the national/ international fellowship/financial support /international travel grant',
        drie: 'Name of the national/ international fellowship/financial support /international travel grant',
      } },

    { key: 'amount', label: 'Financial support (amount in INR)', type: 'money', required: true,
      min: 0, section: 'Support',
      exportAs: {
        faculty: 'Financial support (amount in INR)',
        drie: 'Financial support (amount in INR)',
      } },

    { key: 'purpose', label: 'Purpose of the grant', type: 'textarea', required: true,
      maxLength: 600, colSpan: 2, section: 'Support',
      exportAs: { faculty: 'Pupose of the grant', drie: 'Pupose of the grant' } },

    { key: 'stature', label: 'Stature of fellowship', type: 'select', required: true,
      listKey: 'fellowshipStature', section: 'Award',
      exportAs: {
        faculty: 'Stature of fellowship (national/International)',
        drie: 'Stature of fellowship (national/International)',
      } },

    { key: 'agency', label: 'Awarding Agency', type: 'text', required: true, maxLength: 240,
      section: 'Award',
      exportAs: { faculty: 'Awarding Agency', drie: 'Awarding Agency' } },

    { key: 'awardYear', label: 'Year of Award', type: 'year', required: true, min: 1990, max: 2100,
      section: 'Award', help: 'Financial year of the award.',
      exportAs: {
        faculty: 'Year of Award (Financial year 2024, 2023, 2022)',
        drie: 'Year of Award (Financial year)',
      } },

    { key: 'evidence', label: 'Attach Grant letter/Award Letter', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      exportAs: {
        faculty: 'Attach Grant letter/Award Letter',
        drie: 'Attach Grant letter/Award Letter',
      } },
  ],
  listColumns: ['name', 'supportType', 'stature', 'agency', 'amount', 'awardYear'],
  defaultSort: { key: 'awardYear', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Fellowship' },
    { workbook: 'drie', sheet: 'Fellowship' },
  ],
  feedsCounters: [
    'fellowships.count.cycle', 'fellowships.count.sinceJoining',
    'fellowships.sum.cycle', 'fellowships.sum.sinceJoining',
  ],
};
