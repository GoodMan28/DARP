// src/modules/mous.ts
import type { ModuleConfig } from './_types';

export const mous: ModuleConfig = {
  key: 'mous',
  name: 'MoUs & Activities',
  group: 'Department',
  periodType: 'AY',
  naacRef: '3.7.2',
  bodies: ['NAAC'],
  description:
    'Functional MoUs with institutions and industry, and the activities actually conducted under each one.',
  ownerRoles: ['hod'],
  verifierRoles: ['drie'],
  viewRoles: ['faculty', 'hod', 'drie', 'admin'],
  scope: 'department',
  naturalKey: ['organisation', 'signingDate'],
  fields: [
    { key: 'organisation', label: 'Organisation with which MoU is signed', type: 'text',
      required: true, maxLength: 240, colSpan: 2, section: 'MoU',
      exportAs: {
        drie: 'Organisation with which MoU is signed', hod: 'Organisation with which MoU is signed',
      } },

    { key: 'institutionName', label: 'Name of the institution/ industry/ corporate house',
      type: 'text', required: true, maxLength: 240, colSpan: 2, section: 'MoU',
      exportAs: {
        drie: 'Name of the institution/ industry/ corporate house',
        hod: 'Name of the institution/ industry/ corporate house',
      } },

    { key: 'signingDate', label: 'Date of signing the MoU', type: 'date', required: true,
      notFuture: true, periodSource: true, exportYear: true, section: 'MoU',
      exportAs: { drie: 'Year of signing MoU', hod: 'Year of signing MoU' } },

    { key: 'durationYears', label: 'Duration (in years)', type: 'decimal', required: true, min: 0.5, max: 30,
      unit: 'years', placeholder: '3', help: 'A number only, for example 3 or 1.5.',
      section: 'MoU',
      exportAs: { drie: 'Duration', hod: 'Duration' } },

    { key: 'purpose', label: 'Purpose of MoU/Collaboration', type: 'textarea', maxLength: 600,
      colSpan: 2, section: 'MoU',
      help: 'Required by the HOD workbook.',
      exportAs: { hod: 'Purpose of MoU/Collaboration' } },

    { key: 'activities', label: 'List the actual activities under each MOU year wise',
      type: 'textarea', required: true, maxLength: 1200, colSpan: 2, section: 'Activity',
      exportAs: {
        drie: 'List the  actual  activities under each MOU year wise',
        hod: 'List the  actual  activities under each MOU year wise',
      } },

    { key: 'activityDate', label: 'Date of Activity Conducted', type: 'date', section: 'Activity',
      exportAs: { hod: 'Date of Activity Conducted' } },

    { key: 'participants', label: 'Number of students/teachers participated under MoUs',
      type: 'integer', required: true, min: 0, section: 'Activity',
      exportAs: {
        drie: 'Number of students/teachers participated under MoUs',
        hod: 'Number of students/teachers participated under MoUs',
      } },

    { key: 'evidence', label: 'Attach document (Yearly MoU Activity Report)', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 2, colSpan: 2, section: 'Evidence',
      exportAs: { hod: 'Attach document (Yearly MoU Activity Report)' } },
  ],
  derived: [{ key: 'validUntil', label: 'Valid until' }],
  listColumns: ['organisation', 'institutionName', 'signingDate', 'durationYears', 'validUntil', 'participants'],
  defaultSort: { key: 'signingDate', dir: 'desc' },
  exportTargets: [
    { workbook: 'drie', sheet: 'MoUs' },
    { workbook: 'hod', sheet: 'MoUs' },
  ],
};
