// src/modules/exams.ts
import type { ModuleConfig } from './_types';

export const exams: ModuleConfig = {
  key: 'exams',
  name: 'Students Qualifying Competitive Exams',
  group: 'Students',
  periodType: 'AY',
  naacRef: '5.2.1',
  bodies: ['NAAC', 'NIRF'],
  description:
    'Students qualifying in state, national or international level examinations. One row per student. Do not include the university’s own entrance examination.',
  ownerRoles: ['cdc'],
  verifierRoles: ['admin'],
  viewRoles: ['cdc', 'admin'],
  scope: 'institute',
  naturalKey: ['registrationNo', 'examName', 'year'],
  fields: [
    { key: 'year', label: 'Year', type: 'year', required: true, min: 1990, max: 2100,
      section: 'Exam',
      exportAs: { cdc: 'Year' } },

    { key: 'examName', label: 'Examination', type: 'select', required: true,
      listKey: 'competitiveExams', section: 'Exam',
      help: 'Do not include individual university entrance examinations.' },
    // No exportAs: this field decides WHICH exam column the student is tallied under.
    // The CDC sheet has one column per exam (NET, SLET, GATE…); see 07 §7.7 for that mapping.

    { key: 'otherExamName', label: 'If "Other", specify the examination', type: 'text',
      maxLength: 160, required: true, section: 'Exam',
      showIf: {
        field: 'examName',
        in: ['Other examinations conducted by the State / Central Government Agencies'],
      } },

    { key: 'studentName', label: 'Names of students selected/ qualified', type: 'text',
      required: true, maxLength: 160, colSpan: 2, section: 'Student',
      exportAs: { cdc: 'Names of students selected/ qualified' } },

    { key: 'registrationNo', label: 'Registration number/roll number for the exam', type: 'text',
      required: true, maxLength: 60, section: 'Student',
      exportAs: { cdc: 'Registration number/roll number for the exam' } },

    { key: 'evidence', label: 'Attach scorecard / result', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence' },
  ],
  listColumns: ['studentName', 'registrationNo', 'examName', 'year'],
  defaultSort: { key: 'year', dir: 'desc' },
  exportTargets: [{ workbook: 'cdc', sheet: '5.2.1' }],
};
