// src/modules/patents.ts
import type { ModuleConfig } from './_types';

export const patents: ModuleConfig = {
  key: 'patents',
  name: 'Patents',
  group: 'Research',
  periodType: 'CY',
  naacRef: '3.4',
  bodies: ['NAAC', 'NIRF'],
  description: 'All patents you own, published or granted. The application number stops duplicates.',
  ownerRoles: ['faculty'],
  verifierRoles: ['drie'],
  viewRoles: ['hod', 'drie', 'admin'],
  scope: 'self',
  naturalKey: ['applicationNo'],
  fields: [
    { key: 'inventors', label: 'Name of the Inventor(s)', type: 'text', required: true,
      maxLength: 400, colSpan: 2, section: 'Patent',
      exportAs: { faculty: 'Name of the Inventor(s)', drie: 'Name of the Inventor(s)' } },

    { key: 'applicant', label: 'Name of the Applicant', type: 'text', required: true,
      maxLength: 240, section: 'Patent',
      exportAs: { faculty: 'Name of the Applicant', drie: 'Name of the Applicant' } },

    { key: 'country', label: 'Patent filed in which country?', type: 'select', required: true,
      listKey: 'countries', section: 'Patent',
      exportAs: { faculty: 'Patent filed in which country?', drie: 'Patent filed in which country?' } },

    { key: 'filedDate', label: 'Patent Filed Date', type: 'date', section: 'Patent',
      help: 'Required by the DRIE sheet only.',
      exportAs: { drie: 'Patent Filed Date (DD/MM/YYYY)' } },

    { key: 'applicationNo', label: 'Patent Application Number / Patent Grant Number', type: 'text',
      required: true, maxLength: 80, section: 'Patent',
      exportAs: {
        faculty: 'Patent Application Number / Patent Grant Number',
        drie: 'Patent Application Number / Patent Grant Number',
      } },

    { key: 'title', label: 'Title of the patent', type: 'text', required: true, maxLength: 400,
      colSpan: 2, section: 'Patent',
      exportAs: { faculty: 'Title of the patent', drie: 'Title of the patent' } },

    { key: 'status', label: 'Status of Patent', type: 'select', required: true,
      listKey: 'patentStatus', section: 'Status',
      exportAs: { faculty: 'Status of Patent', drie: 'Status of Patent' } },

    { key: 'statusDate', label: 'Date of Publish/Grant of patent', type: 'date', required: true,
      section: 'Status',
      exportAs: {
        faculty: 'Date of Publish/Award of patent (starting from latest calendar year)',
        drie: 'Date of Publish/Grant of patent (starting from latest calendar year)',
      } },

    { key: 'assignee', label: 'Assignee/s Name (Institute Affiliation/s at time of Appication)',
      type: 'text', maxLength: 240, colSpan: 2, section: 'Status',
      exportAs: { drie: 'Assignee/s Name (Institute Affiliation/s at time of Appication)' } },

    { key: 'category', label: 'Category of Patent', type: 'select', listKey: 'patentCategories',
      section: 'Status',
      exportAs: { drie: 'Category of Patent (Engineering/Pharmacy/Management/Others)' } },

    { key: 'evidence', label: 'Attach documents (published/grant certificate)', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      exportAs: {
        faculty: 'Attach documents (published/grant certificate)',
        drie: 'Attach documents (published/grant certificate)',
      } },
  ],
  listColumns: ['title', 'applicationNo', 'status', 'statusDate', 'country'],
  defaultSort: { key: 'statusDate', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Patents' },
    { workbook: 'drie', sheet: 'Patents' },
  ],
  feedsCounters: [
    'patents.count.published.cycle', 'patents.count.published.sinceJoining',
    'patents.count.granted.cycle', 'patents.count.granted.sinceJoining',
  ],
};
