// src/modules/edpmdp.ts
import type { ModuleConfig } from './_types';

export const edpmdp: ModuleConfig = {
  key: 'edpmdp',
  name: 'EDP/MDP Revenue',
  group: 'Department',
  periodType: 'FY',
  naacRef: '3.5',
  bodies: ['NAAC', 'NIRF'],
  description:
    'Executive and management development programmes organised by your department, and the revenue they earned.',
  ownerRoles: ['hod'],
  verifierRoles: ['dofa'],
  viewRoles: ['hod', 'dofa', 'admin'],
  scope: 'department',
  naturalKey: ['financialYear'],
  fields: [
    { key: 'financialYear', label: 'Financial Year', type: 'year', required: true, min: 1990,
      max: 2100, section: 'Period',
      exportAs: { hod: 'Financial Year' } },

    { key: 'programCount',
      label: 'Total Number of Executive Development Programs/Management Development Programs',
      type: 'integer', required: true, min: 0, colSpan: 2, section: 'Programmes',
      exportAs: { hod: 'Total Number of Executive Development Programs/Management Development Programs' } },

    { key: 'participants', label: 'Total number of participants', type: 'integer', required: true,
      min: 0, section: 'Programmes',
      exportAs: { hod: 'Total number of participants' } },

    { key: 'earnings', label: 'Total annual earnings (Amount in Rupees)', type: 'money',
      required: true, min: 0, section: 'Revenue',
      help: 'Excluding lodging and boarding charges. The amount in words is generated on export.',
      exportAs: { hod: 'Total annual earnings (Amount in Rupees)(Excluding lodging and boarding charges)' } },
  ],
  listColumns: ['financialYear', 'programCount', 'participants', 'earnings'],
  defaultSort: { key: 'financialYear', dir: 'desc' },
  exportTargets: [{ workbook: 'hod', sheet: 'EDP-MDP' }],
};
