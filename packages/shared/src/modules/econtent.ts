// src/modules/econtent.ts
import type { ModuleConfig } from './_types';

export const econtent: ModuleConfig = {
  key: 'econtent',
  name: 'E-content',
  group: 'Teaching',
  periodType: 'CY',
  naacRef: '3.4',
  bodies: ['NAAC'],
  description:
    'E-content modules you developed for e-PG Pathshala, CEC, SWAYAM, other MOOC platforms, government initiatives or the institutional LMS.',
  ownerRoles: ['faculty'],
  verifierRoles: ['dugs'],
  viewRoles: ['hod', 'dugs', 'admin'],
  scope: 'self',
  naturalKey: ['moduleName', 'platform'],
  fields: [
    { key: 'moduleName', label: 'Name of the module developed', type: 'text', required: true,
      maxLength: 300, colSpan: 2, section: 'Module',
      exportAs: {
        faculty: 'Name of the module developed', dugs: 'Name of the module developed',
      } },

    { key: 'platform', label: 'Platform on which module is developed', type: 'select',
      required: true, listKey: 'econtentPlatforms', section: 'Module',
      exportAs: {
        faculty: 'Platform on which module is developed',
        dugs: 'Platform on which module is developed',
      } },

    { key: 'launchDate', label: 'Date of launching e content', type: 'date', required: true,
      section: 'Module',
      exportAs: {
        faculty: 'Date of launching e content In DD/MM/YYYY (For calendar years 2024, 2023, 2022)',
        dugs: 'Date of launching e content In DD/MM/YYYY (For calendar years 2024, 2023, 2022)',
      } },

    { key: 'moduleLink', label: 'Link to the module developed', type: 'url', required: true,
      maxLength: 500, colSpan: 2, section: 'Module',
      exportAs: { faculty: 'Link to the module developed', dugs: 'Link to the module developed' } },
  ],
  listColumns: ['moduleName', 'platform', 'launchDate'],
  defaultSort: { key: 'launchDate', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'E-content' },
    { workbook: 'dugs', sheet: 'E-content' },
  ],
  feedsCounters: ['econtent.count.cycle', 'econtent.count.sinceJoining'],
};
