// src/modules/fdpattended.ts
import type { ModuleConfig } from './_types';

export const fdpattended: ModuleConfig = {
  key: 'fdpattended',
  name: 'FDPs Attended',
  group: 'Faculty',
  periodType: 'CY',
  naacRef: '6.3.3',
  bodies: ['NAAC'],
  description:
    'Faculty and management development programmes you attended — online or face to face, including orientation, refresher and short-term courses.',
  ownerRoles: ['faculty'],
  verifierRoles: ['dofa'],
  viewRoles: ['hod', 'dofa', 'admin'],
  scope: 'self',
  naturalKey: ['organisingInstitution', 'startDate'],
  fields: [
    { key: 'programType', label: 'Type of Program', type: 'select', required: true,
      listKey: 'fdpProgramTypes', section: 'Programme',
      exportAs: {
        faculty: 'Type of Program (Professional Development Programmes, Orientation/Induction Programmes, Refresher Course, Short Term Course )',
        dofa: 'Type of Program (Professional Development Programmes, Orientation/Induction Programmes, Refresher Course, Short Term Course )',
      } },

    { key: 'organisingInstitution', label: 'Name of the Organising Institution', type: 'text',
      required: true, maxLength: 240, colSpan: 2, section: 'Programme',
      exportAs: {
        faculty: 'Name of the Organising Institution', dofa: 'Name of the Organising Institution',
      } },

    { key: 'startDate', label: 'Start Date', type: 'date', required: true, section: 'Dates',
      exportAs: { faculty: 'Start Date', dofa: 'Start Date' } },

    { key: 'endDate', label: 'End Date', type: 'date', required: true, section: 'Dates',
      exportAs: { faculty: 'End Date', dofa: 'End Date' } },

    { key: 'durationDays', label: 'Duration (in No. of days)', type: 'integer', required: true,
      min: 1, max: 365, section: 'Dates',
      exportAs: { faculty: 'Duration (in No. of days)', dofa: 'Duration (in No. of days)' } },

    { key: 'evidence', label: 'Attach e-copy of Certificate', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      exportAs: { faculty: 'Attach e-copy of Certificate', dofa: 'Attach e-copy of Certificate' } },
  ],
  listColumns: ['organisingInstitution', 'programType', 'startDate', 'durationDays'],
  defaultSort: { key: 'startDate', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'FDPs' },
    { workbook: 'dofa', sheet: 'FDPs' },
  ],
  feedsCounters: ['fdpattended.count.cycle', 'fdpattended.count.sinceJoining'],
};
