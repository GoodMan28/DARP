// src/modules/extawards.ts
import type { ModuleConfig } from './_types';

export const extawards: ModuleConfig = {
  key: 'extawards',
  name: 'Awards for Extension Activities',
  group: 'Faculty',
  periodType: 'CY',
  naacRef: '3.6',
  bodies: ['NAAC'],
  description:
    'Awards recognising extension activities only — social outreach, NSS, NCC, socio-economic development. Do not repeat awards entered elsewhere.',
  ownerRoles: ['faculty'],
  verifierRoles: ['dofa'],
  viewRoles: ['hod', 'dofa', 'admin'],
  scope: 'self',
  naturalKey: ['awardName', 'awardYear'],
  fields: [
    { key: 'activityName', label: 'Name of the activity', type: 'text', required: true,
      maxLength: 300, colSpan: 2, section: 'Activity',
      exportAs: { faculty: 'Name of the activity', dofa: 'Name of the activity' } },

    { key: 'awardName', label: 'Name of the Award/ recognition', type: 'text', required: true,
      maxLength: 300, colSpan: 2, section: 'Award',
      exportAs: { faculty: 'Name of the Award/ recognition', dofa: 'Name of the Award/ recognition' } },

    { key: 'awardingBody',
      label: 'Name of the Awarding government/ government recognised bodies', type: 'text',
      required: true, maxLength: 240, section: 'Award',
      exportAs: {
        faculty: 'Name of the Awarding government/ government recognised bodies',
        dofa: 'Name of the Awarding government/ government recognised bodies',
      } },

    { key: 'awardYear', label: 'Year of award', type: 'year', required: true, min: 1990, max: 2100,
      section: 'Award',
      exportAs: {
        faculty: 'Year of award  (starting from latest calendar year) (data for 2024, 2023, 2022)',
        dofa: 'Year of award  (starting from latest calendar year) (data for 2024, 2023, 2022)',
      } },

    { key: 'evidence', label: 'Attach documents (Award letters)', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      exportAs: {
        faculty: 'Attach documents  (Award letters)', dofa: 'Attach documents  (Award letters)',
      } },
  ],
  listColumns: ['awardName', 'activityName', 'awardingBody', 'awardYear'],
  defaultSort: { key: 'awardYear', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Awards for Extn. activities' },
    { workbook: 'dofa', sheet: 'Awards for Extn. activities' },
  ],
  feedsCounters: ['extawards.count.cycle', 'extawards.count.sinceJoining'],
};
