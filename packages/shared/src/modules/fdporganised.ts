// src/modules/fdporganised.ts
import type { ModuleConfig } from './_types';

export const fdporganised: ModuleConfig = {
  key: 'fdporganised',
  name: 'FDPs Organised',
  group: 'Department',
  periodType: 'CY',
  naacRef: '6.3',
  bodies: ['NAAC'],
  description: 'Faculty development programmes organised by your department.',
  ownerRoles: ['hod'],
  verifierRoles: ['dofa'],
  viewRoles: ['hod', 'dofa', 'admin'],
  scope: 'department',
  naturalKey: ['title', 'startDate'],
  fields: [
    { key: 'title', label: 'Title of the program', type: 'text', required: true, maxLength: 300,
      colSpan: 2, section: 'Programme',
      exportAs: { hod: 'Title of the program' } },

    { key: 'startDate', label: 'Start date', type: 'date', required: true, section: 'Duration',
      exportAs: { hod: 'Duration (from – to) (DD-MM-YYYY)' } },

    { key: 'endDate', label: 'End date', type: 'date', required: true, section: 'Duration',
      help: 'The export writes the start and end dates into the single "from – to" column.' },

    { key: 'internalFaculty', label: 'Number of internal faculty who attended', type: 'integer',
      required: true, min: 0, section: 'Attendance',
      exportAs: { hod: 'Number of internal faculty who attended' } },

    { key: 'externalFaculty', label: 'Number of external faculty who attended', type: 'integer',
      required: true, min: 0, section: 'Attendance',
      exportAs: { hod: 'Number of external faculty who attended' } },

    { key: 'evidence', label: 'Attach documents', type: 'file', accept: ['pdf', 'jpg', 'jpeg', 'png'],
      maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      help: 'Notice, schedule, geo-tagged photos, event reports, attendees.',
      exportAs: { hod: 'Attach documents (notice, schedule, geo-tagged photos, event reports, attendees)' } },
  ],
  listColumns: ['title', 'startDate', 'endDate', 'internalFaculty', 'externalFaculty'],
  defaultSort: { key: 'startDate', dir: 'desc' },
  exportTargets: [{ workbook: 'hod', sheet: 'FDPs' }],
};
