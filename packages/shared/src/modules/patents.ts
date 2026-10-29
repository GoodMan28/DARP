// src/modules/patents.ts
import type { ModuleConfig } from './_types';

export const patents: ModuleConfig = {
  key: 'patents',
  name: 'Patents',
  group: 'Research',
  periodType: 'CY',
  naacRef: '3.4',
  bodies: ['NAAC', 'NIRF'],
  description:
    'All patents you own: applied, published or granted. Type the application number (or the patent number) and press Fetch details — an Indian patent\'s details are filled in from the Patent Office Journal. Each patent is entered once.',
  ownerRoles: ['faculty', 'hod'],
  verifierRoles: ['drie'],
  viewRoles: ['hod', 'drie', 'admin'],
  scope: 'self',
  naturalKey: ['applicationNo'],
  lookup: {
    kind: 'patent', idFields: ['applicationNo'], idLabel: 'Patent application number or patent number',
    sourceName: 'the Patent Office Journal', personWord: 'inventor',
    // As for Publications: approved on submission, spot-checked afterwards by DRIE/IQAC.
    autoApprove: 'always',
    acceptTypes: ['patent-application', 'patent-grant'],
    ownerMustBeIn: 'inventors',
    evidenceField: 'evidence',
  },
  fields: [
    { key: 'inventors', label: 'Name of the Inventor(s)', type: 'text', required: true,
      maxLength: 400, colSpan: 2, section: 'Patent', autofill: { from: 'inventors', locked: false },
      help: 'Filled in from the Patent Office Journal. Your own name must be in this list before you can submit — add it if it is missing, and attach evidence.',
      exportAs: { faculty: 'Name of the Inventor(s)', drie: 'Name of the Inventor(s)' } },

    { key: 'applicant', label: 'Name of the Applicant', type: 'text', required: true,
      maxLength: 240, section: 'Patent', autofill: { from: 'applicant', locked: true },
      exportAs: { faculty: 'Name of the Applicant', drie: 'Name of the Applicant' } },

    { key: 'country', label: 'Patent filed in which country?', type: 'select', required: true,
      listKey: 'countries', section: 'Patent', autofill: { from: 'country', locked: true },
      exportAs: { faculty: 'Patent filed in which country?', drie: 'Patent filed in which country?' } },

    { key: 'filedDate', label: 'Date filed (Applied)', type: 'date', section: 'Patent', notFuture: true,
      autofill: { from: 'filedDate', locked: true },
      help: 'The date on the filing receipt. Required when the status is Applied.',
      exportAs: { drie: 'Patent Filed Date (DD/MM/YYYY)' } },

    { key: 'applicationNo', label: 'Patent application number', type: 'text',
      required: true, maxLength: 80, section: 'Patent', normalise: 'patentNumber',
      help: 'You can also type the patent (grant) number; DARP finds the application number. Indian numbers: 202331012345 or 935/KOL/2013.',
      exportAs: {
        faculty: 'Patent Application Number / Patent Grant Number',
        drie: 'Patent Application Number / Patent Grant Number',
      } },

    { key: 'patentNumber', label: 'Patent (grant) number', type: 'text', maxLength: 80, section: 'Patent',
      autofill: { from: 'patentNo', locked: true, alwaysLocked: true }, naWhenEmpty: true, placeholder: 'NA',
      help: 'Filled in when the Patent Office Journal publishes the grant. Until then it shows NA.',
      exportAs: { faculty: 'Patent Number', drie: 'Patent Number' } },

    { key: 'title', label: 'Title of the patent', type: 'text', required: true, maxLength: 400,
      colSpan: 2, section: 'Patent', autofill: { from: 'title', locked: true },
      exportAs: { faculty: 'Title of the patent', drie: 'Title of the patent' } },

    { key: 'status', label: 'Status of Patent', type: 'select', required: true,
      listKey: 'patentStatus', section: 'Status', autofill: { from: 'patentStatus', locked: true },
      help: 'Applied, Published or Granted. It is filled in and kept up to date from the Patent Office Journal; if the number is not found, choose it yourself and attach the proof.',
      exportAs: { faculty: 'Status of Patent', drie: 'Status of Patent' } },

    { key: 'publishedDate', label: 'Date published (Patent Office Journal)', type: 'date', section: 'Status',
      notFuture: true, showIf: { field: 'status', in: ['Published', 'Granted'] },
      autofill: { from: 'publishedDate', locked: true } },

    { key: 'grantDate', label: 'Date granted (as published in the Journal)', type: 'date', section: 'Status',
      notFuture: true, showIf: { field: 'status', in: ['Granted'] },
      autofill: { from: 'grantDate', locked: true } },

    { key: 'statusDate', label: 'Date of Publish/Grant of patent', type: 'date', required: true, periodSource: true,
      section: 'Status', autofill: { from: 'statusDate', locked: true, alwaysLocked: true },
      help: 'Worked out for you from the status: the filing, publication or grant date. Enter the date for the status you chose above.',
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
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 2, colSpan: 2, section: 'Evidence', required: true,
      help: 'Required for every patent: the journal page or the grant certificate. DRIE and IQAC check it against the details above — especially anything you changed or typed yourself.',
      exportAs: {
        faculty: 'Attach documents (published/grant certificate)',
        drie: 'Attach documents (published/grant certificate)',
      } },
  ],
  listColumns: ['title', 'applicationNo', 'patentNumber', 'status', 'statusDate'],
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
