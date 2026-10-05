// src/modules/mentorship.ts
import type { ModuleConfig } from './_types';

export const mentorship: ModuleConfig = {
  key: 'mentorship',
  name: 'Student Mentorship',
  group: 'Students',
  periodType: 'AY',
  naacRef: '2.3',
  bodies: ['NAAC'],
  description: 'Every UG student for whom you are the Mentor in the current academic year.',
  ownerRoles: ['faculty'],
  verifierRoles: ['dugs'],
  viewRoles: ['hod', 'dugs', 'admin'],
  scope: 'self',
  naturalKey: ['rollNo'],
  fields: [
    { key: 'studentName', label: 'Name of Student', type: 'text', required: true, maxLength: 160,
      section: 'Student',
      exportAs: { faculty: 'Name of Student', dugs: 'Name of Student' } },

    { key: 'rollNo', label: 'Roll No. of Student', type: 'text', required: true, maxLength: 40,
      section: 'Student',
      exportAs: { faculty: 'Roll No. of Student', dugs: 'Roll No. of Student' } },

    { key: 'program', label: 'Program', type: 'text', required: true, maxLength: 120,
      section: 'Student',
      exportAs: { faculty: 'Program', dugs: 'Program' } },

    { key: 'branch', label: 'Branch', type: 'text', required: true, maxLength: 120,
      section: 'Student',
      exportAs: { faculty: 'Branch', dugs: 'Branch' } },

    { key: 'email', label: 'Personal Mail ID', type: 'email', pii: 'masked', sensitive: true,
      section: 'Contact',
      exportAs: { faculty: 'Personal Mail ID', dugs: 'Personal Mail ID' } },

    { key: 'phone', label: 'Phone Number', type: 'phone', pii: 'masked', sensitive: true,
      section: 'Contact',
      exportAs: { faculty: 'Phone Number', dugs: 'Phone Number' } },

    { key: 'activityReport', label: 'Attach Mentorship Activity Reports', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      exportAs: {
        faculty: 'Attach Mentorship Activity Reports', dugs: 'Attach Mentorship Activity Reports',
      } },
  ],
  listColumns: ['studentName', 'rollNo', 'program', 'branch'],
  defaultSort: { key: 'rollNo', dir: 'asc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Mentorship' },
    { workbook: 'dugs', sheet: 'Mentorship' },
  ],
};
