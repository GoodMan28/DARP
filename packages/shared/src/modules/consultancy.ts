// src/modules/consultancy.ts
import type { ModuleConfig } from './_types';

export const consultancy: ModuleConfig = {
  key: 'consultancy',
  name: 'Consultancy & Corporate Training',
  group: 'Research',
  periodType: 'FY',
  naacRef: '3.5',
  bodies: ['NAAC', 'NIRF'],
  description: 'Revenue generated from consultancy projects and from corporate training programmes.',
  ownerRoles: ['faculty'],
  verifierRoles: ['drie'],
  viewRoles: ['hod', 'drie', 'admin'],
  scope: 'self',
  naturalKey: ['projectTitle', 'agency', 'financialYear'],
  fields: [
    { key: 'recordType', label: 'This entry is', type: 'select', required: true,
      options: ['Consultancy', 'Corporate training'], section: 'Engagement',
      help: 'Consultancy and corporate training are counted and exported separately.' },

    { key: 'consultants', label: 'Name of the consultant / trainers', type: 'text', required: true,
      maxLength: 300, colSpan: 2, section: 'Engagement',
      help: 'List every teacher-consultant or trainer involved.',
      exportAs: { faculty: 'Name of the consultant', drie: 'Name of the consultant' } },

    { key: 'projectTitle', label: 'Name of the consultancy project / training programme',
      type: 'text', required: true, maxLength: 400, colSpan: 2, section: 'Engagement',
      exportAs: { faculty: 'Name of the consultancy project', drie: 'Name of the consultancy project' } },

    { key: 'agency', label: 'Agency with contact details', type: 'textarea', required: true,
      maxLength: 400, colSpan: 2, section: 'Engagement',
      help: 'The consulting/sponsoring agency, or the agency seeking training. Include contact details.',
      exportAs: {
        faculty: 'Consulting/Sponsoring agency with contact details',
        drie: 'Consulting/Sponsoring agency with contact details',
      } },

    { key: 'financialYear', label: 'Financial year', type: 'year', required: true, min: 1990,
      max: 2100, section: 'Revenue',
      exportAs: { faculty: 'Year (Financial years 2024, 2023, 2022)', drie: 'Financial year' } },

    { key: 'revenue', label: 'Revenue generated (amount in rupees)', type: 'money', required: true,
      min: 0, section: 'Revenue',
      exportAs: {
        faculty: 'Revenue generated (amount in rupees)',
        drie: 'Revenue generated (amount in rupees)',
      } },

    { key: 'numberOfTrainees', label: 'Number of trainees', type: 'integer', min: 0,
      section: 'Revenue', showIf: { field: 'recordType', in: ['Corporate training'] },
      exportAs: { faculty: 'Number of trainees', drie: 'Number of trainees' } },

    { key: 'evidence', label: 'Attach document', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      help: 'Consultancy: letter from the beneficiary with the consultancy fee. Training: letter from the corporate with the fee paid.',
      exportAs: {
        faculty: 'Attach document (Letter from beneficiary of consultancy with details of consultancy fee)',
        drie: 'Attach document (Letter from beneficiary of consultancy with details of consultancy fee)',
      } },
  ],
  listColumns: ['projectTitle', 'recordType', 'agency', 'financialYear', 'revenue'],
  defaultSort: { key: 'financialYear', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Consultancy' },
    { workbook: 'drie', sheet: 'Consultancy' },
  ],
  feedsCounters: [
    'consultancy.count.consultancy.cycle', 'consultancy.count.consultancy.sinceJoining',
    'consultancy.sum.consultancy.cycle', 'consultancy.sum.consultancy.sinceJoining',
    'consultancy.count.training.cycle', 'consultancy.count.training.sinceJoining',
    'consultancy.sum.training.cycle', 'consultancy.sum.training.sinceJoining',
  ],
};
