// src/modules/finsupport.ts
import type { ModuleConfig } from './_types';

export const finsupport: ModuleConfig = {
  key: 'finsupport',
  name: 'Financial Support (conf./membership)',
  group: 'Faculty',
  periodType: 'FY',
  naacRef: '6.3',
  bodies: ['NAAC'],
  description:
    'Institute support for attending conferences and workshops, and for professional-body membership fees. Minimum ₹5,000 per teacher per year.',
  ownerRoles: ['faculty'],
  verifierRoles: ['dofa'],
  viewRoles: ['hod', 'dofa', 'admin'],
  scope: 'self',
  naturalKey: ['title', 'supportYear'],
  fields: [
    { key: 'purpose', label: 'Purpose of financial support', type: 'select', required: true,
      listKey: 'finSupportPurpose', section: 'Support',
      exportAs: { faculty: 'Purpose of financial support', dofa: 'Purpose of financial support' } },

    { key: 'supportYear', label: 'Year in which support provided', type: 'year', required: true,
      min: 1990, max: 2100, section: 'Support',
      exportAs: {
        faculty: 'Year in which support provided (FY 2024, 2023, 2022)',
        dofa: 'Year in which support provided (FY 2024, 2023, 2022)',
      } },

    { key: 'title',
      label: 'Title of the conference/ workshops/ name of the professional body', type: 'text',
      required: true, maxLength: 300, colSpan: 2, section: 'Support',
      exportAs: {
        faculty: 'Title of the conference/ workshops/ name of the professional body',
        dofa: 'Title of the conference/ workshops/ name of the professional body',
      } },

    { key: 'startDate', label: 'Start Date of the conference/workshop', type: 'date',
      section: 'Dates', showIf: { field: 'purpose', in: ['Conference/Workshop/Seminar/Symposium, etc'] },
      exportAs: {
        faculty: 'Start Date of the conference/workshop',
        dofa: 'Start Date of the conference/workshop',
      } },

    { key: 'endDate', label: 'End Date of the conference/workshop', type: 'date', section: 'Dates',
      showIf: { field: 'purpose', in: ['Conference/Workshop/Seminar/Symposium, etc'] },
      exportAs: {
        faculty: 'End Date of the conference/workshop', dofa: 'End Date of the conference/workshop',
      } },

    { key: 'type', label: 'Type of conference/workshop/symposium/seminar/professional body',
      type: 'select', required: true, listKey: 'finSupportType', section: 'Support',
      exportAs: {
        faculty: 'Type of conference/workshop/symposium/seminar/professional body',
        dofa: 'Type of conference/workshop/symposium/seminar/professional body',
      } },

    { key: 'amount', label: 'Amount provided by the Institute (after settlement)', type: 'money',
      required: true, min: 5000, section: 'Support',
      help: 'Minimum ₹5,000 for the support to count towards the metric.',
      exportAs: {
        faculty: 'Amount provided by the Institute (after settlement)',
        dofa: 'Amount provided by the Institute (after settlement)',
      } },

    { key: 'evidence', label: 'Attach documents', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      help: 'E-copy of the approval letter indicating financial assistance.',
      exportAs: {
        faculty: 'Attach documents (e-copy of approval letter indicating financial assistance)',
        dofa: 'Attach documents (e-copy of approval letter indicating financial assistance)',
      } },
  ],
  listColumns: ['title', 'purpose', 'type', 'amount', 'supportYear'],
  defaultSort: { key: 'supportYear', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Fin. support' },
    { workbook: 'dofa', sheet: 'Fin. support' },
  ],
  feedsCounters: ['finsupport.count.cycle', 'finsupport.sum.cycle'],
};
