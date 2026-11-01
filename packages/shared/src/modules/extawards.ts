// src/modules/extawards.ts
import type { ModuleConfig } from './_types';
import { FACULTY_MEMBERS, institutionField } from './_types';

export const extawards: ModuleConfig = {
  key: 'extawards',
  name: 'Awards for Extension Activities',
  group: 'Faculty',
  periodType: 'CY',
  naacRef: '3.6',
  bodies: ['NAAC'],
  description:
    'Awards recognising extension activities only — social outreach, NSS, NCC, socio-economic development. Do not repeat awards entered elsewhere.',
  ownerRoles: FACULTY_MEMBERS,
  verifierRoles: ['dofa'],
  viewRoles: ['hod', 'dofa', 'admin'],
  scope: 'self',
  naturalKey: ['awardName', 'awardDate'],
  fields: [
    { key: 'activityName', label: 'Name of the activity', type: 'text', required: true,
      maxLength: 300, colSpan: 2, section: 'Activity',
      exportAs: { faculty: 'Name of the activity', dofa: 'Name of the activity' } },

    { key: 'awardName', label: 'Name of the Award/ recognition', type: 'text', required: true,
      maxLength: 300, colSpan: 2, section: 'Award',
      exportAs: { faculty: 'Name of the Award/ recognition', dofa: 'Name of the Award/ recognition' } },

    ...institutionField({ key: 'awardingBody',
      label: 'Name of the Awarding government/ government recognised bodies',
      required: true, maxLength: 240, section: 'Award',
      exportAs: {
        faculty: 'Name of the Awarding government/ government recognised bodies',
        dofa: 'Name of the Awarding government/ government recognised bodies',
      } }, { exportId: false }),

    { key: 'awardDate', label: 'Date of award', type: 'date', required: true,
      notFuture: true, periodSource: true, exportYear: true, section: 'Award', help: 'The date of the award letter.',
      exportAs: {
        faculty: 'Year of award  (starting from latest calendar year) (data for 2024, 2023, 2022)',
        dofa: 'Year of award  (starting from latest calendar year) (data for 2024, 2023, 2022)',
      } },

    { key: 'validityYears', label: 'Validity (in years)', type: 'decimal', required: true, min: 0.5, max: 100,
      unit: 'years', placeholder: '3', section: 'Award', showIf: { field: 'validForLife', in: ['', 'false'] },
      help: 'How long the award stands from the date of award, for example 1, 2 or 5. A number only.',
      exportAs: { faculty: 'Validity (years)', dofa: 'Validity (years)' } },

    { key: 'validForLife', label: 'Valid for life', type: 'checkbox', section: 'Award',
      help: 'Tick this if the award never expires. The number of years is then not asked for.',
      exportAs: { faculty: 'Valid for life', dofa: 'Valid for life' } },

    { key: 'evidence', label: 'Attach documents (Award letters)', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 2, colSpan: 2, section: 'Evidence',
      exportAs: {
        faculty: 'Attach documents  (Award letters)', dofa: 'Attach documents  (Award letters)',
      } },
  ],
  derived: [{ key: 'validUntil', label: 'Valid until', exportAs: { faculty: 'Valid until', dofa: 'Valid until' } }],
  listColumns: ['awardName', 'activityName', 'awardingBody', 'awardDate', 'validUntil'],
  defaultSort: { key: 'awardDate', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Awards for Extn. activities' },
    { workbook: 'dofa', sheet: 'Awards for Extn. activities' },
  ],
  feedsCounters: ['extawards.count.cycle', 'extawards.count.sinceJoining', 'extawards.count.active'],
};
