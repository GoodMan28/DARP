// src/modules/profile.ts
import type { ModuleConfig } from './_types';

export const profile: ModuleConfig = {
  key: 'profile',
  name: 'Faculty Profile',
  group: 'Faculty',
  periodType: 'AY',
  bodies: ['NAAC', 'NIRF'],
  description:
    'Your identity, qualifications and appointment details. Every count on your profile is computed from your records — nothing here is hand-counted.',
  ownerRoles: ['faculty'],
  verifierRoles: ['dofa'],
  viewRoles: ['hod', 'dofa', 'admin'],
  scope: 'self',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, maxLength: 160, colSpan: 2,
      section: 'Identity',
      exportAs: { faculty: 'Name' } },

    { key: 'pan', label: 'PAN No.', type: 'pan', required: true,
      pii: 'encrypted', sensitive: true, section: 'Identity',
      help: 'Stored encrypted. Shown as XXXXX1234X. Only IQAC can reveal it, and every reveal is logged.',
      exportAs: { faculty: 'PAN No.' } },

    { key: 'aadhaar', label: 'AADHAAR No.', type: 'aadhaar', required: true,
      pii: 'encrypted', sensitive: true, section: 'Identity',
      help: 'Stored encrypted. Shown as XXXX-XXXX-1234. Only IQAC can reveal it, and every reveal is logged.',
      exportAs: { faculty: 'AADHAAR No.' } },

    { key: 'designation', label: 'Designation', type: 'select', required: true,
      listKey: 'designations', section: 'Appointment',
      exportAs: { faculty: 'Designation' } },

    { key: 'natureOfAssociation', label: 'Nature of Association', type: 'select', required: true,
      listKey: 'natureOfAssociation', section: 'Appointment',
      exportAs: { faculty: 'Nature of Association' } },

    { key: 'ugQualification', label: 'UG Qualification', type: 'select', required: true,
      listKey: 'ugQualifications', section: 'Qualifications',
      exportAs: { faculty: 'UG Qualification' } },

    { key: 'ugInstitution', label: 'Name of College/University, State and Country of UG Degree',
      type: 'text', required: true, maxLength: 240, colSpan: 2, section: 'Qualifications',
      exportAs: { faculty: 'Name of College/University, State and Country of UG Degree' } },

    { key: 'pgQualification', label: 'PG Qualification', type: 'select', required: true,
      listKey: 'pgQualifications', section: 'Qualifications',
      exportAs: { faculty: 'PG Qualification' } },

    { key: 'pgInstitution', label: 'Name of College/University, State and Country of PG Degree',
      type: 'text', maxLength: 240, colSpan: 2, section: 'Qualifications',
      exportAs: { faculty: 'Name of College/University, State and Country of PG Degree' } },

    { key: 'hasPhd', label: 'PhD Qualification? (Yes/No)', type: 'select', required: true,
      options: ['Yes', 'No'], section: 'Qualifications',
      exportAs: { faculty: 'PhD Qualification? (Yes/No)' } },

    { key: 'phdInstitution', label: 'Name of College/University, State and Country of PhD Degree',
      type: 'text', maxLength: 240, colSpan: 2, section: 'Qualifications',
      showIf: { field: 'hasPhd', in: ['Yes'] },
      exportAs: { faculty: 'Name of College/University, State and Country of PhD Degree' } },

    { key: 'hasPostdoc', label: 'Post Doctoral Research Experience (Yes/No)', type: 'select',
      required: true, options: ['Yes', 'No'], section: 'Qualifications',
      exportAs: { faculty: 'Post Doctoral Research Experience (Yes/No)' } },

    { key: 'postdocMonths',
      label: 'Total Duration of Post Doctoral Research Experience (in months)',
      type: 'integer', min: 0, max: 600, section: 'Qualifications',
      showIf: { field: 'hasPostdoc', in: ['Yes'] },
      exportAs: { faculty: 'Total Duration of Post Doctoral Research Experience (in months)' } },

    { key: 'postdocInstitution',
      label: 'Name of College/University, State and Country of Post-doc qualification',
      type: 'text', maxLength: 240, colSpan: 2, section: 'Qualifications',
      showIf: { field: 'hasPostdoc', in: ['Yes'] },
      exportAs: { faculty: 'Name of College/University, State and Country of Post-doc qualification' } },

    { key: 'highestDegreeDate', label: 'Date of Receiving Highest Degree (Either PhD or PG)',
      type: 'date', required: true, section: 'Appointment',
      exportAs: { faculty: 'Date of Receiving Highest Degree (Either PhD or PG)' } },

    { key: 'joiningDate',
      label: 'Date of Joining BIT (as UGC complied post like Lecturer/Asst. Prof/Assoc Prof/Prof)',
      type: 'date', required: true, section: 'Appointment',
      help: 'This date decides every "since joining BIT" count on your profile.',
      exportAs: { faculty: 'Date of Joining BIT (as UGC complied post like Lecturer/Asst. Prof/Assoc Prof/Prof) (DD/MM/YYYY)' } },

    { key: 'lastPromotionDate', label: 'Date of last promotion', type: 'date',
      section: 'Appointment',
      exportAs: { faculty: 'Date of last promotion (DD/MM/YYYY)' } },

    { key: 'teachingExperienceMonths', label: 'Total Teaching Experience (Lifetime) (in months)',
      type: 'integer', required: true, min: 0, max: 720, section: 'Experience',
      exportAs: { faculty: 'Total Teaching Experience (Lifetime) (in months)' } },

    { key: 'industryExperienceMonths', label: 'Total Industry Experience (Lifetime) (in months)',
      type: 'integer', min: 0, max: 720, section: 'Experience',
      exportAs: { faculty: 'Total Industry Experience (Lifetime)(in months)' } },

    { key: 'teachingHours', label: 'Number of Teaching Hours put in last year', type: 'integer',
      required: true, min: 0, max: 2000, section: 'Workload',
      help: 'Summation of total class hours in MO and SP sessions, as per the current timetable.',
      exportAs: { faculty: 'Number of Teaching Hours put in last year (AY 2024-25) (summation of total class hours in MO and SP sessions)' } },

    { key: 'researchHours', label: 'Number of Research Hours put in last year', type: 'integer',
      required: true, min: 0, max: 2000, section: 'Workload',
      help: 'Approximate. Used in the NIRF faculty-load computation.',
      exportAs: { faculty: 'Number of Research Hours put in last year (AY 2024-25) (approximately)' } },

    { key: 'consultancyHours', label: 'Number of consultancy Hours put in last year',
      type: 'integer', min: 0, max: 2000, section: 'Workload',
      help: 'Approximate, for the financial year.',
      exportAs: { faculty: 'Number of consultancy Hours put in last year (FY 2024-25) (approximately)' } },
  ],
  listColumns: ['name', 'designation', 'natureOfAssociation', 'joiningDate'],
  defaultSort: { key: 'name', dir: 'asc' },
  exportTargets: [{ workbook: 'faculty', sheet: 'Profile' }],
};
