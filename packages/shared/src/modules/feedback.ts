// src/modules/feedback.ts
import type { ModuleConfig } from './_types';

export const feedback: ModuleConfig = {
  key: 'feedback',
  name: 'Curriculum Feedback',
  group: 'Department',
  periodType: 'AY',
  naacRef: '1.4.1',
  bodies: ['NAAC'],
  description:
    'How structured feedback on the curriculum is collected from students, teachers, employers, alumni and academic peers. Choose one classification.',
  ownerRoles: ['hod'],
  verifierRoles: ['dugs'],
  viewRoles: ['hod', 'dugs', 'admin'],
  scope: 'department',
  fields: [
    { key: 'classification', label: 'Feedback process classification', type: 'select',
      required: true, listKey: 'feedbackClassifications', colSpan: 2, section: 'Classification',
      help: 'Opt any one. The export marks your choice Yes and the others No.' },

    { key: 'documentLinks', label: 'Links to the documents', type: 'textarea', maxLength: 2000,
      colSpan: 2, section: 'Evidence', required: true,
      help: 'One link per line. Required for every classification except "Feedback not collected".',
      showIf: {
        field: 'classification',
        in: [
          'A. Feedback collected, analysed, action taken & communicated to relevant body and feedback hosted on the institutional website',
          'B. Feedback collected, analysed, action has been taken and communicated to the relevant body',
          'C. Feedback collected and analysed',
          'D. Feedback collected',
        ],
      },
      exportAs: { hod: 'If yes, pls provide links to the documents' } },

    { key: 'evidence', label: 'Attach supporting document', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence' },
  ],
  listColumns: ['classification'],
  defaultSort: { key: 'classification', dir: 'asc' },
  exportTargets: [{ workbook: 'hod', sheet: 'Feedback' }],
};
