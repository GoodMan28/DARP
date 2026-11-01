// src/modules/fellowships.ts
import type { ModuleConfig } from './_types';
import { FACULTY_MEMBERS, affiliationField, institutionField } from './_types';

export const fellowships: ModuleConfig = {
  key: 'fellowships',
  name: 'Fellowships & Travel Grants',
  group: 'Research',
  periodType: 'FY',
  naacRef: '3.1',
  bodies: ['NAAC'],
  description:
    'National and international fellowships, financial support for advanced study or research, and sponsored international travel grants.',
  ownerRoles: FACULTY_MEMBERS,
  verifierRoles: ['drie'],
  viewRoles: ['hod', 'drie', 'admin'],
  scope: 'self',
  naturalKey: ['name', 'awardDate'],
  affiliation: { field: 'affiliatedToBit', dates: ['awardDate'] },
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

    ...institutionField({ key: 'agency', label: 'Awarding Agency', required: true, maxLength: 240,
      section: 'Award',
      exportAs: { faculty: 'Awarding Agency', drie: 'Awarding Agency' } }, { exportId: false }),

    { key: 'awardDate', label: 'Date of award', type: 'date', required: true,
      notFuture: true, periodSource: true, exportYear: true, section: 'Award', help: 'The date of the award letter.',
      exportAs: {
        faculty: 'Year of Award (Financial year 2024, 2023, 2022)',
        drie: 'Year of Award (Financial year)',
      } },

    { key: 'validityYears', label: 'Validity (in years)', type: 'decimal', required: true, min: 0.5, max: 100,
      unit: 'years', placeholder: '3', section: 'Award', showIf: { field: 'validForLife', in: ['', 'false'] },
      help: 'How long the award stands from the date of award, for example 1, 2 or 5. A number only.',
      exportAs: { faculty: 'Validity (years)', drie: 'Validity (years)' } },

    { key: 'validForLife', label: 'Valid for life', type: 'checkbox', section: 'Award',
      help: 'Tick this if the award never expires. The number of years is then not asked for.',
      exportAs: { faculty: 'Valid for life', drie: 'Valid for life' } },

    { key: 'evidence', label: 'Attach Grant letter/Award Letter', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 2, colSpan: 2, section: 'Evidence',
      exportAs: {
        faculty: 'Attach Grant letter/Award Letter',
        drie: 'Attach Grant letter/Award Letter',
      } },

    affiliationField({ label: 'Did you receive this while you were at BIT?', section: 'Award' }),
  ],
  derived: [{ key: 'validUntil', label: 'Valid until', exportAs: { faculty: 'Valid until', drie: 'Valid until' } }],
  listColumns: ['name', 'supportType', 'stature', 'agency', 'amount', 'awardDate', 'validUntil'],
  defaultSort: { key: 'awardDate', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Fellowship' },
    { workbook: 'drie', sheet: 'Fellowship' },
  ],
  feedsCounters: [
    'fellowships.count.cycle', 'fellowships.count.sinceJoining', 'fellowships.count.active',
    'fellowships.sum.cycle', 'fellowships.sum.sinceJoining',
  ],
};
