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
    'All patents you own, published or granted. Type the application number (or the patent number) and press Fetch details — an Indian patent\'s details are filled in from the Patent Office Journal. Each patent is entered once.',
  ownerRoles: ['faculty'],
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

    { key: 'filedDate', label: 'Patent Filed Date', type: 'date', section: 'Patent',
      autofill: { from: 'filedDate', locked: true },
      help: 'Required by the DRIE sheet only.',
      exportAs: { drie: 'Patent Filed Date (DD/MM/YYYY)' } },

    { key: 'applicationNo', label: 'Patent Application Number / Patent Grant Number', type: 'text',
      required: true, maxLength: 80, section: 'Patent', normalise: 'patentNumber',
      help: 'Indian numbers: 202331012345, 935/KOL/2013, or the 6-digit patent number. Choose the country first.',
      exportAs: {
        faculty: 'Patent Application Number / Patent Grant Number',
        drie: 'Patent Application Number / Patent Grant Number',
      } },

    { key: 'title', label: 'Title of the patent', type: 'text', required: true, maxLength: 400,
      colSpan: 2, section: 'Patent', autofill: { from: 'title', locked: true },
      exportAs: { faculty: 'Title of the patent', drie: 'Title of the patent' } },

    { key: 'status', label: 'Status of Patent', type: 'select', required: true,
      listKey: 'patentStatus', section: 'Status', autofill: { from: 'patentStatus', locked: true },
      help: 'Granted when the Patent Office Journal has published the grant; otherwise Published.',
      exportAs: { faculty: 'Status of Patent', drie: 'Status of Patent' } },

    { key: 'statusDate', label: 'Date of Publish/Grant of patent', type: 'date', required: true,
      section: 'Status', autofill: { from: 'statusDate', locked: true },
      help: 'For a published application, the date the Patent Office Journal published it; for a granted patent, the date of the journal issue that published the grant.',
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
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence', required: true,
      help: 'Required for every patent: the journal page or the grant certificate. DRIE and IQAC check it against the details above — especially anything you changed or typed yourself.',
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
