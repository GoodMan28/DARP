// src/modules/studentsguided.ts
import type { ModuleConfig } from './_types';

export const studentsguided: ModuleConfig = {
  key: 'studentsguided',
  name: 'Students Guided',
  group: 'Students',
  periodType: 'AY',
  naacRef: '5.2',
  bodies: ['NAAC', 'NIRF'],
  description:
    'Every UG, PG and PhD student for whom you are the Guide, with what they did after passing.',
  ownerRoles: ['faculty'],
  verifierRoles: ['dofa'],
  viewRoles: ['hod', 'dofa', 'admin'],
  scope: 'self',
  naturalKey: ['rollNo', 'yearOfPassing'],
  fields: [
    { key: 'studentName', label: 'Name of Student', type: 'text', required: true, maxLength: 160,
      section: 'Student',
      exportAs: { faculty: 'Name of Student', dofa: 'Name of Student' } },

    { key: 'rollNo', label: 'Roll No. of Student', type: 'text', required: true, maxLength: 40,
      section: 'Student',
      exportAs: { faculty: 'Roll No. of Student', dofa: 'Roll No. of Student' } },

    { key: 'level', label: 'Level (UG/PG/PHD)', type: 'select', required: true,
      listKey: 'studentLevels', section: 'Student',
      exportAs: { faculty: 'Level (UG/PG/PHD)', dofa: 'Level (UG/PG/PHD)' } },

    { key: 'program', label: 'Program', type: 'text', required: true, maxLength: 120,
      section: 'Student',
      exportAs: { faculty: 'Program', dofa: 'Program' } },

    { key: 'specialisation', label: 'Specialisation', type: 'text', maxLength: 120,
      section: 'Student',
      exportAs: { faculty: 'Specialisation', dofa: 'Specialisation' } },

    { key: 'email', label: 'Personal Mail ID', type: 'email', pii: 'masked', sensitive: true,
      section: 'Contact',
      help: 'Personal data — visible only to you, the verifying office and IQAC.',
      exportAs: { faculty: 'Personal Mail ID', dofa: 'Personal Mail ID' } },

    { key: 'phone', label: 'Phone Number', type: 'phone', pii: 'masked', sensitive: true,
      section: 'Contact',
      exportAs: { faculty: 'Phone Number', dofa: 'Phone Number' } },

    { key: 'yearOfPassing', label: 'Year of Passing', type: 'year', required: true, min: 1990,
      max: 2100, section: 'Outcome',
      exportAs: { faculty: 'Year of Passing', dofa: 'Year of Passing' } },

    { key: 'statusAfterPassing', label: 'Status after passing', type: 'select', required: true,
      options: ['Competitive exams', 'Employed', 'Higher Studies', 'None of the above'],
      section: 'Outcome',
      help: 'The fields below change to match the option you pick.',
      exportAs: { faculty: 'Status after passing', dofa: 'Status after passing' } },

    { key: 'examGiven', label: 'Exam given', type: 'select', listKey: 'competitiveExams',
      required: true, section: 'Competitive exams',
      showIf: { field: 'statusAfterPassing', in: ['Competitive exams'] },
      exportAs: {
        faculty: 'Exam given (NET/SLET/GATE/GMAT/GPAT/CAT/GRE/JAM/IELET/TOEFL/Civil Services/State govt exams/Any other state or central govt exams)',
        dofa: 'Exam given (NET/SLET/GATE/GMAT/GPAT/CAT/GRE/JAM/IELET/TOEFL/Civil Services/State govt exams/Any other state or central govt exams)',
      } },

    { key: 'examRegistrationNo', label: 'Registration Number of such exam', type: 'text',
      required: true, maxLength: 60, section: 'Competitive exams',
      showIf: { field: 'statusAfterPassing', in: ['Competitive exams'] },
      exportAs: {
        faculty: 'Registration Number of such exam (Evidence reqd: ScoreCard)',
        dofa: 'Registration Number of such exam (Evidence reqd: ScoreCard)',
      } },

    { key: 'examScorecard', label: 'Scorecard', type: 'file', accept: ['pdf', 'jpg', 'jpeg', 'png'],
      maxSizeMB: 5, colSpan: 2, section: 'Competitive exams',
      showIf: { field: 'statusAfterPassing', in: ['Competitive exams'] } },

    { key: 'employerName', label: 'Name of Employer', type: 'text', required: true, maxLength: 200,
      section: 'Employment', showIf: { field: 'statusAfterPassing', in: ['Employed'] },
      exportAs: { faculty: 'Name of Employer', dofa: 'Name of Employer' } },

    { key: 'payPackage', label: 'Pay package at appointment', type: 'money', required: true, min: 0,
      sensitive: true, pii: 'masked', section: 'Employment',
      showIf: { field: 'statusAfterPassing', in: ['Employed'] },
      help: 'Gross CTC in rupees, as stated in the offer letter.',
      exportAs: {
        faculty: 'Pay package at appointment  (Evidence reqd: Offer letter mentioning gross CTC)',
        dofa: 'Pay package at appointment  (Evidence reqd: Offer letter mentioning gross CTC)',
      } },

    { key: 'offerLetter', label: 'Offer letter', type: 'file', accept: ['pdf', 'jpg', 'jpeg', 'png'],
      maxSizeMB: 5, colSpan: 2, section: 'Employment',
      showIf: { field: 'statusAfterPassing', in: ['Employed'] } },

    { key: 'institutionEnrolled', label: 'Name of institution enrolled in', type: 'text',
      required: true, maxLength: 200, section: 'Higher studies',
      showIf: { field: 'statusAfterPassing', in: ['Higher Studies'] },
      exportAs: {
        faculty: 'Name of institution enrolled in', dofa: 'Name of institution enrolled in',
      } },

    { key: 'programEnrolled', label: 'Program enrolled in', type: 'text', required: true,
      maxLength: 200, section: 'Higher studies',
      showIf: { field: 'statusAfterPassing', in: ['Higher Studies'] },
      exportAs: {
        faculty: 'Program enrolled in  (Evidence reqd: Admission Letter/ID Card)',
        dofa: 'Program enrolled in  (Evidence reqd: Admission Letter/ID Card)',
      } },

    { key: 'admissionLetter', label: 'Admission letter / ID card', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Higher studies',
      showIf: { field: 'statusAfterPassing', in: ['Higher Studies'] } },
  ],
  listColumns: ['studentName', 'rollNo', 'level', 'yearOfPassing', 'statusAfterPassing'],
  defaultSort: { key: 'yearOfPassing', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Students guided' },
    { workbook: 'dofa', sheet: 'Students guided' },
  ],
  feedsCounters: [
    'studentsguided.count.ug.cycle', 'studentsguided.count.ug.sinceJoining',
    'studentsguided.count.pg.cycle', 'studentsguided.count.pg.sinceJoining',
    'studentsguided.count.phd.cycle', 'studentsguided.count.phd.sinceJoining',
  ],
};
