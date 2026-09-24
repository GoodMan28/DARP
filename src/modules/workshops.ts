// src/modules/workshops.ts
import type { ModuleConfig } from './_types';

export const workshops: ModuleConfig = {
  key: 'workshops',
  name: 'Student Workshops & Training',
  group: 'Department',
  periodType: 'AY',
  naacRef: '1.3',
  bodies: ['NAAC'],
  description:
    'Students undertaking workshops and training apart from internships, and students involved in research or consultancy projects.',
  ownerRoles: ['hod'],
  verifierRoles: ['dugs'],
  viewRoles: ['hod', 'dugs', 'admin'],
  scope: 'department',
  naturalKey: ['programmeName', 'programCode'],
  fields: [
    { key: 'programmeName', label: 'Programme name', type: 'text', required: true, maxLength: 200,
      section: 'Programme',
      exportAs: { hod: 'Programme name' } },

    { key: 'programCode', label: 'Program Code', type: 'text', required: true, maxLength: 40,
      section: 'Programme',
      exportAs: { hod: 'Program Code' } },

    { key: 'studentsInWorkshops',
      label: 'List of students undertaking workshops/training programs apart from internships',
      type: 'textarea', required: true, maxLength: 4000, colSpan: 2, section: 'Table A',
      help: 'One student per line: name and roll number.',
      exportAs: { hod: 'List of students undertaking workshops/training programs apart from internships' } },

    { key: 'studentsInResearch', label: 'List of students involved in research/consultancy projects',
      type: 'textarea', maxLength: 4000, colSpan: 2, section: 'Table B',
      help: 'One student per line: name and roll number.',
      exportAs: { hod: 'List of students involved in research/consultancy projects' } },

    { key: 'liveProjects', label: 'No. of live projects with student participation', type: 'integer',
      required: true, min: 0, section: 'Department counts',
      exportAs: { hod: 'No. of live projects with student participation:' } },

    { key: 'ethicsEvents',
      label: 'No. of events/workshops conducted by the college to develop students professional ethics',
      type: 'integer', required: true, min: 0, section: 'Department counts',
      exportAs: { hod: 'No. of events/workshops conducted by the college to develop students professional ethics:' } },

    { key: 'industryGuestSpeakers', label: 'No. of guest speakers from the industry', type: 'integer',
      required: true, min: 0, section: 'Department counts',
      exportAs: { hod: 'No. of guest speakers from the industry:' } },

    { key: 'studentsInResearchCount',
      label: 'No. of students involved in research and consultancy undertaken by the college',
      type: 'integer', required: true, min: 0, section: 'Department counts',
      exportAs: { hod: 'No. of students involved in research and consultancy undertaken by the college:' } },

    { key: 'evidence', label: 'Attach evidence', type: 'file', accept: ['pdf', 'jpg', 'jpeg', 'png'],
      maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      help: 'Certificates, event reports, photographs, attendance sheets.',
      exportAs: { hod: 'Attach evidence (Certificates, event reports, photographs, attendance sheets)' } },
  ],
  listColumns: ['programmeName', 'programCode', 'liveProjects', 'industryGuestSpeakers'],
  defaultSort: { key: 'programmeName', dir: 'asc' },
  exportTargets: [{ workbook: 'hod', sheet: 'Student Workshops' }],
};
