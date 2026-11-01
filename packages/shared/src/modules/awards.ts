// src/modules/awards.ts
import type { ModuleConfig } from './_types';
import { FACULTY_MEMBERS, institutionField } from './_types';

export const awards: ModuleConfig = {
  key: 'awards',
  name: 'Awards & Recognition',
  group: 'Faculty',
  periodType: 'CY',
  naacRef: '2.4',
  bodies: ['NAAC'],
  description:
    'Awards, recognitions and fellowships from government or government-recognised bodies. Research and extension awards belong in their own modules.',
  ownerRoles: FACULTY_MEMBERS,
  verifierRoles: ['dofa'],
  viewRoles: ['hod', 'dofa', 'admin'],
  scope: 'self',
  naturalKey: ['awardName', 'awardDate'],
  fields: [
    { key: 'awardDate', label: 'Date of award', type: 'date', required: true,
      notFuture: true, periodSource: true, exportYear: true, section: 'Award', help: 'The date of the award letter.',
      exportAs: {
        faculty: 'Year of Award (starting from latest calendar year) (data for 2024, 2023, 2022)',
        dofa: 'Year of Award (starting from latest calendar year) (data for 2024, 2023, 2022)',
      } },

    { key: 'validityYears', label: 'Validity (in years)', type: 'decimal', required: true, min: 0.5, max: 100,
      unit: 'years', placeholder: '3', section: 'Award', showIf: { field: 'validForLife', in: ['', 'false'] },
      help: 'How long the award stands from the date of award, for example 1, 2 or 5. A number only.',
      exportAs: { faculty: 'Validity (years)', dofa: 'Validity (years)' } },

    { key: 'validForLife', label: 'Valid for life', type: 'checkbox', section: 'Award',
      help: 'Tick this if the award never expires. The number of years is then not asked for.',
      exportAs: { faculty: 'Valid for life', dofa: 'Valid for life' } },

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

    ...institutionField({ key: 'agency', label: 'Name of the Awarding Agency', required: true,
      maxLength: 240, section: 'Award',
      exportAs: { faculty: 'Name of the Awarding Agency', dofa: 'Name of the Awarding Agency' } }, { exportId: false }),

    { key: 'evidence', label: 'Attach documents (Certificate Award Letters)', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 2, colSpan: 2, section: 'Evidence',
      exportAs: {
        faculty: 'Attach documents (Certificate Award Letters )',
        dofa: 'Attach documents (Certificate Award Letters )',
      } },
  ],
  derived: [{ key: 'validUntil', label: 'Valid until', exportAs: { faculty: 'Valid until', dofa: 'Valid until' } }],
  listColumns: ['awardName', 'level', 'agency', 'awardDate', 'validUntil'],
  defaultSort: { key: 'awardDate', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Awards' },
    { workbook: 'dofa', sheet: 'Awards' },
  ],
  feedsCounters: ['awards.count.cycle', 'awards.count.sinceJoining', 'awards.count.active'],
};
