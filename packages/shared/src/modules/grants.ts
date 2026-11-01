// src/modules/grants.ts
import type { ModuleConfig } from './_types';
import { FACULTY_MEMBERS, affiliationField, institutionField } from './_types';

export const grants: ModuleConfig = {
  key: 'grants',
  name: 'Funds & Grants',
  group: 'Research',
  periodType: 'FY',
  naacRef: '3.2.1',
  bodies: ['NAAC', 'NIRF'],
  description:
    'Research funding received through government and non-government sources — projects, endowments and research chairs.',
  ownerRoles: FACULTY_MEMBERS,
  verifierRoles: ['drie'],
  viewRoles: ['hod', 'drie', 'admin'],
  scope: 'self',
  naturalKey: ['title', 'agencyCode', 'sanctionDate'],
  affiliation: { field: 'affiliatedToBit', dates: ['sanctionDate'] },
  fields: [
    { key: 'role', label: 'Role of faculty', type: 'select', required: true, listKey: 'projectRoles',
      section: 'Project',
      exportAs: { faculty: 'Role of faculty', drie: 'Role of faculty' } },

    { key: 'title', label: 'Title of the research project, endowments, Research Chairs',
      type: 'text', required: true, maxLength: 400, colSpan: 2, section: 'Project',
      exportAs: {
        faculty: 'Title of the research project, endowments, Research Chairs',
        drie: 'Title of the research project, endowments, Research Chairs',
      } },

    ...institutionField({ key: 'agency', label: 'Name of the funding agency', required: true,
      maxLength: 240, section: 'Funding', placeholder: 'SERB, DST',
      exportAs: { faculty: 'Name of the funding agency', drie: 'Name of the funding agency' } }, { exportId: false }),

    { key: 'agencyCategory', label: 'Category of Funding Agency', type: 'select', required: true,
      listKey: 'agencyCategories', section: 'Funding',
      exportAs: {
        faculty: 'Category of Funding Agency  (Government / Non-Government)',
        drie: 'Category of Funding Agency  (Government / Non-Government)',
      } },

    { key: 'durationYears', label: 'Duration (in years)', type: 'decimal', required: true, min: 0.5, max: 30,
      unit: 'years', section: 'Funding', placeholder: '3', help: 'A number only, for example 3 or 1.5.',
      exportAs: { faculty: 'Duration', drie: 'Duration' } },

    { key: 'sanctionDate', label: 'Date of sanction', type: 'date', required: true,
      notFuture: true, periodSource: true, exportYear: true, section: 'Funding',
      help: 'The date on the sanction letter.',
      exportAs: {
        faculty: 'Year of award or sanction (FY 2024, 2023, 2022)',
        drie: 'Year of award or sanction',
      } },

    { key: 'amount', label: 'Amount in INR.', type: 'money', required: true, min: 0,
      section: 'Funding', placeholder: '4820000',
      help: 'Digits only — BITWISE formats it as ₹ 48,20,000.',
      exportAs: { faculty: 'Amount in INR.', drie: 'Amount in INR.' } },

    { key: 'evidence', label: 'Attach documents (Project Sanction letter)', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 2, colSpan: 2, section: 'Evidence',
      exportAs: {
        faculty: 'Attach documents (Project Sanction letter)',
        drie: 'Attach documents (Project Sanction letter)',
      } },

    affiliationField({ label: 'Was this project sanctioned while you were at BIT?', section: 'Funding' }),
  ],
  derived: [{ key: 'projectPeriod', label: 'Project period' }],
  listColumns: ['title', 'agency', 'role', 'agencyCategory', 'amount', 'sanctionDate', 'projectPeriod'],
  defaultSort: { key: 'sanctionDate', dir: 'desc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'Funds&Grants' },
    { workbook: 'drie', sheet: 'Funds&Grants' },
  ],
  feedsCounters: [
    'grants.count.pi.cycle', 'grants.count.pi.sinceJoining',
    'grants.sum.pi.cycle', 'grants.sum.pi.sinceJoining',
    'grants.count.copi.cycle', 'grants.count.copi.sinceJoining',
    'grants.sum.copi.cycle', 'grants.sum.copi.sinceJoining',
  ],
};
