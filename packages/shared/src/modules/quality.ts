// src/modules/quality.ts
import type { ModuleConfig } from './_types';

export const quality: ModuleConfig = {
  key: 'quality',
  name: 'Quality Assurance Activities',
  group: 'Institution',
  periodType: 'CY',
  naacRef: '6.5.2',
  bodies: ['NAAC'],
  description:
    'Quality assurance measures adopted by the institution — conferences on quality, collaborative initiatives and orientation programmes.',
  ownerRoles: ['dofa'],
  verifierRoles: ['admin'],
  viewRoles: ['dofa', 'admin'],
  scope: 'institute',
  naturalKey: ['year'],
  fields: [
    { key: 'year', label: 'Year', type: 'year', required: true, min: 1990, max: 2100,
      section: 'Year',
      exportAs: { dofa: 'Year' } },

    { key: 'conferencesOnQuality', label: 'Conferences, Seminars, Workshops on quality conducted',
      type: 'textarea', maxLength: 2000, colSpan: 2, section: 'Activities',
      exportAs: { dofa: 'Confernces, Seminars, Workshops on quality conducted' } },

    { key: 'collaborativeInitiatives',
      label: 'Collaborative quality initiatives with other institution(s)', type: 'textarea',
      maxLength: 2000, colSpan: 2, section: 'Activities',
      help: 'Provide the name of the institution and the activity.',
      exportAs: { dofa: 'Collaborative quality initiatives with other institution(s) (Provide name of the institution and activity' } },

    { key: 'orientationProgrammes',
      label: 'Orientation programme on quality issues for teachers and students', type: 'textarea',
      maxLength: 2000, colSpan: 2, section: 'Activities',
      help: 'Include the dates (From–To).',
      exportAs: { dofa: 'Orientation programme on quality issues for teachers and students organised by the institution, Date (From-To) (DD-MM-YYYY)' } },

    { key: 'evidence', label: 'Attach supporting documents', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence' },
  ],
  listColumns: ['year'],
  defaultSort: { key: 'year', dir: 'desc' },
  exportTargets: [{ workbook: 'dofa', sheet: 'Quality Activities' }],
};
