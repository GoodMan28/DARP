// src/modules/outreach.ts
import type { ModuleConfig } from './_types';
import { FACULTY_MEMBERS } from './_types';

/** The kinds of academic service, a fixed list: each kind's own fields depend on its exact wording. */
export const OUTREACH_TYPES = {
  thesis: 'PhD thesis review',
  talk: 'Invited talk',
  viva: 'PhD viva voce',
  body: 'Member of a Board of Studies, Academic Council or other academic body',
  paperSetter: 'Question paper setter',
  review: 'Journal paper review',
  industry: 'Industry visit',
  chair: 'Session chair / co-chair',
  other: 'Other (specify)',
} as const;

const T = OUTREACH_TYPES;
/** Show a field for these kinds only. */
const when = (...kinds: string[]) => ({ field: 'activityType', in: kinds });

export const outreach: ModuleConfig = {
  key: 'outreach',
  name: 'Outreach Activities',
  group: 'Faculty',
  periodType: 'CY',
  bodies: ['NAAC'],
  description:
    'Academic service at BIT or outside it: thesis reviews and vivas, invited talks, boards of studies, question papers, journal reviews, industry visits and session chairs. Choose the kind first; the form then asks only what that kind needs.',
  ownerRoles: FACULTY_MEMBERS,
  verifierRoles: ['dofa'],
  viewRoles: ['hod', 'dofa', 'admin'],
  scope: 'self',
  // No duplicate guard: the guard is institute-wide, and two colleagues may well review for the same
  // journal or speak at the same event in the same year.
  fields: [
    { key: 'activityType', label: 'Type of activity', type: 'select', required: true,
      options: Object.values(T), section: 'Activity',
      exportAs: { faculty: 'Type of activity', dofa: 'Type of activity' } },

    { key: 'otherType', label: 'Specify the activity', type: 'text', required: true, maxLength: 160,
      section: 'Activity', showIf: when(T.other),
      exportAs: { faculty: 'Specify the activity', dofa: 'Specify the activity' } },

    /* What it was */
    { key: 'eventName', label: 'Name of the event / programme', type: 'text', required: true, maxLength: 300,
      colSpan: 2, section: 'Activity', showIf: when(T.thesis, T.talk, T.viva, T.paperSetter, T.industry, T.chair, T.other),
      help: 'The conference, seminar series, examination or visit, as the invitation or letter names it.',
      exportAs: { faculty: 'Name of the event / programme', dofa: 'Name of the event / programme' } },

    { key: 'journalName', label: 'Name of the journal', type: 'text', required: true, maxLength: 300,
      colSpan: 2, section: 'Activity', showIf: when(T.review),
      exportAs: { faculty: 'Name of the journal', dofa: 'Name of the journal' } },
    { key: 'publisher', label: 'Publisher', type: 'text', maxLength: 160, section: 'Activity', showIf: when(T.review),
      exportAs: { faculty: 'Publisher', dofa: 'Publisher' } },
    { key: 'papersReviewed', label: 'Number of papers reviewed', type: 'integer', required: true, min: 1, max: 500,
      section: 'Activity', showIf: when(T.review), help: 'For this journal in this year.',
      exportAs: { faculty: 'Number of papers reviewed', dofa: 'Number of papers reviewed' } },

    { key: 'bodyKind', label: 'Body', type: 'select', required: true,
      options: ['Board of Studies', 'Academic Council', 'Other academic body'], section: 'Activity', showIf: when(T.body),
      exportAs: { faculty: 'Body', dofa: 'Body' } },
    { key: 'bodyName', label: 'Name of the body', type: 'text', required: true, maxLength: 240, colSpan: 2,
      section: 'Activity', showIf: when(T.body), help: 'For example "Board of Studies in Computer Science".',
      exportAs: { faculty: 'Name of the body', dofa: 'Name of the body' } },
    { key: 'memberFrom', label: 'Member from (year)', type: 'year', min: 1960, max: 2100, notFuture: true,
      section: 'Activity', showIf: when(T.body),
      exportAs: { faculty: 'Member from (year)', dofa: 'Member from (year)' } },
    { key: 'memberTo', label: 'Member to (year)', type: 'year', notBefore: 'memberFrom', min: 1960, max: 2100,
      section: 'Activity', showIf: when(T.body), help: 'Leave empty while you are still a member.',
      exportAs: { faculty: 'Member to (year)', dofa: 'Member to (year)' } },

    { key: 'talkTitle', label: 'Title of the talk', type: 'text', required: true, maxLength: 300, colSpan: 2,
      section: 'Activity', showIf: when(T.talk),
      exportAs: { faculty: 'Title of the talk', dofa: 'Title of the talk' } },

    { key: 'examinerRole', label: 'Examiner role', type: 'select', required: true,
      options: ['External examiner', 'Internal examiner'], section: 'Activity', showIf: when(T.thesis, T.viva),
      exportAs: { faculty: 'Examiner role', dofa: 'Examiner role' } },
    { key: 'degreeProgramme', label: 'Degree programme of the candidate', type: 'select', listKey: 'higherStudyProgrammes',
      allowOther: true, maxLength: 160, section: 'Activity', showIf: when(T.thesis, T.viva),
      help: 'The candidate’s name is not needed.',
      exportAs: { faculty: 'Degree programme of the candidate', dofa: 'Degree programme of the candidate' } },

    { key: 'chairRole', label: 'Session role', type: 'select', required: true, options: ['Chair', 'Co-chair'],
      section: 'Activity', showIf: when(T.chair),
      exportAs: { faculty: 'Session role', dofa: 'Session role' } },

    { key: 'course', label: 'Course / paper', type: 'text', required: true, maxLength: 200,
      section: 'Activity', showIf: when(T.paperSetter),
      exportAs: { faculty: 'Course / paper', dofa: 'Course / paper' } },

    { key: 'purpose', label: 'Purpose of the visit', type: 'textarea', required: true, maxLength: 600, colSpan: 2,
      section: 'Activity', showIf: when(T.industry),
      exportAs: { faculty: 'Purpose of the visit', dofa: 'Purpose of the visit' } },

    { key: 'mode', label: 'Mode', type: 'select', options: ['In person', 'Online'],
      section: 'Activity', showIf: when(T.talk, T.viva, T.chair),
      exportAs: { faculty: 'Mode', dofa: 'Mode' } },

    /* Where and when */
    { key: 'organisation', label: 'Name of the organisation', type: 'text', required: true, maxLength: 240,
      colSpan: 2, section: 'Where and when',
      help: 'The university, institute, company or society that invited or appointed you (BIT Mesra if it was here).',
      exportAs: { faculty: 'Name of the organisation', dofa: 'Name of the organisation' } },
    { key: 'where', label: 'Where', type: 'select', required: true, options: ['Outside BIT', 'At BIT'],
      section: 'Where and when', help: 'Outreach usually means outside BIT; activities at BIT are counted separately.',
      exportAs: { faculty: 'Where', dofa: 'Where' } },
    { key: 'date', label: 'Date (if on one day)', type: 'date', notFuture: true, section: 'Where and when',
      exportAs: { faculty: 'Date (if on one day)', dofa: 'Date (if on one day)' } },
    { key: 'year', label: 'Year', type: 'year', required: true, min: 1960, max: 2100, notFuture: true,
      periodSource: true, section: 'Where and when', computed: { kind: 'yearOf', from: 'date' },
      help: 'Taken from the date when there is one.',
      exportAs: { faculty: 'Year', dofa: 'Year' } },

    { key: 'evidence', label: 'Attach the invitation, appointment letter or certificate', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 2, colSpan: 2, section: 'Evidence',
      exportAs: { faculty: 'Attach the invitation, appointment letter or certificate', dofa: 'Attach the invitation, appointment letter or certificate' } },
  ],
  listColumns: ['activityType', 'eventName', 'organisation', 'where', 'year'],
  defaultSort: { key: 'year', dir: 'desc' },
  // IQAC's formats have no sheet for these yet: DARP adds an "Outreach" sheet to the Faculty and DoFA files.
  exportTargets: [
    { workbook: 'faculty', sheet: 'Outreach' },
    { workbook: 'dofa', sheet: 'Outreach' },
  ],
  feedsCounters: [
    'outreach.count.cycle', 'outreach.count.sinceJoining',
    'outreach.count.outside.cycle', 'outreach.count.outside.sinceJoining',
  ],
};
