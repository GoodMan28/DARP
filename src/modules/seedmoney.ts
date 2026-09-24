// src/modules/seedmoney.ts
import type { ModuleConfig } from './_types';

export const seedmoney: ModuleConfig = {
  key: 'seedmoney',
  name: 'Seed Money',
  group: 'Research',
  periodType: 'FY',
  naacRef: '3.1',
  bodies: ['NAAC'],
  description: 'Seed money granted to you by the institute, 2022 onwards.',
  ownerRoles: ['faculty'],
  verifierRoles: ['drie'],
  viewRoles: ['hod', 'drie', 'admin'],
  scope: 'self',
  naturalKey: ['grantDate', 'amount'],
  fields: [
    { key: 'grantDate', label: 'Date of grant', type: 'date', required: true, section: 'Grant',
      exportAs: { faculty: 'Date of grant DD-MM-YYYY', drie: 'Date of grant DD-MM-YYYY' } },

    { key: 'amount', label: 'Amount granted', type: 'money', required: true, min: 0,
      section: 'Grant',
      help: 'Enter the amount in RUPEES, digits only. The export converts it to lakhs for you.',
      exportAs: {
        faculty: 'Amount granted (INR in Lakhs)',
        drie: 'Amount granted (INR in Lakhs)',
      } },

    { key: 'evidence', label: 'Attach sanction letter', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      exportAs: { faculty: 'Attach sanction letter', drie: 'Attach sanction letter' } },
  ],
  listColumns: ['grantDate', 'amount'],
  defaultSort: { key: 'grantDate', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Seed money' },
    { workbook: 'drie', sheet: 'Seed money' },
  ],
  feedsCounters: ['seedmoney.sum.sinceJoining'],
};
