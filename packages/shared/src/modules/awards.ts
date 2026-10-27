// src/modules/awards.ts
import type { ModuleConfig } from './_types';

export const awards: ModuleConfig = {
  key: 'awards',
  name: 'Awards & Recognition',
  group: 'Faculty',
  periodType: 'CY',
  naacRef: '2.4',
  bodies: ['NAAC'],
  description:
    'Awards, recognitions and fellowships from government or government-recognised bodies. Research and extension awards belong in their own modules.',
  ownerRoles: ['faculty'],
  verifierRoles: ['dofa'],
  viewRoles: ['hod', 'dofa', 'admin'],
  scope: 'self',
  naturalKey: ['awardName', 'awardYear'],
  fields: [
    { key: 'awardYear', label: 'Year of Award', type: 'year', required: true, min: 1990, max: 2100,
      section: 'Award',
      exportAs: {
        faculty: 'Year of Award (starting from latest calendar year) (data for 2024, 2023, 2022)',
        dofa: 'Year of Award (starting from latest calendar year) (data for 2024, 2023, 2022)',
      } },

    { key: 'awardName',
      label: 'Name of the award, fellowship, received from Government or Government recognised bodies',
      type: 'text', required: true, maxLength: 300, colSpan: 2, section: 'Award',
      exportAs: {
        faculty: 'Name of the award, fellowship, received from Government or Government recognised bodies',
        dofa: 'Name of the award, fellowship, received from Government or Government recognised bodies',
      } },

    { key: 'level', label: 'Level of Award', type: 'select', required: true, listKey: 'awardLevels',
      section: 'Award',
      exportAs: { faculty: 'Level of Award', dofa: 'Level of Award' } },

    { key: 'agency', label: 'Name of the Awarding Agency', type: 'text', required: true,
      maxLength: 240, section: 'Award',
      exportAs: { faculty: 'Name of the Awarding Agency', dofa: 'Name of the Awarding Agency' } },

    { key: 'awardValidity', label: 'Award Validity', type: 'validity', required: false,
      section: 'Award',
      options: ['1 Year', '2 Years', '3 Years', '5 Years', '10 Years', 'Lifetime', 'Custom'],
      help: 'Select validity duration or enter a custom period in years (e.g. 4, or 0.25, 0.5, 0.75).',
      exportAs: { faculty: 'Award Validity', dofa: 'Award Validity' } },

    { key: 'evidence', label: 'Attach documents (Certificate Award Letters)', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      exportAs: {
        faculty: 'Attach documents (Certificate Award Letters )',
        dofa: 'Attach documents (Certificate Award Letters )',
      } },
  ],
  listColumns: ['awardName', 'level', 'agency', 'awardValidity', 'awardYear'],
  defaultSort: { key: 'awardYear', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Awards' },
    { workbook: 'dofa', sheet: 'Awards' },
  ],
  feedsCounters: ['awards.count.cycle', 'awards.count.sinceJoining'],
};
