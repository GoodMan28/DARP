// src/modules/grants.ts
import type { ModuleConfig } from './_types';

export const grants: ModuleConfig = {
  key: 'grants',
  name: 'Funds & Grants',
  group: 'Research',
  periodType: 'FY',
  naacRef: '3.2.1',
  bodies: ['NAAC', 'NIRF'],
  description:
    'Research funding received through government and non-government sources — projects, endowments and research chairs.',
  ownerRoles: ['faculty'],
  verifierRoles: ['drie'],
  viewRoles: ['hod', 'drie', 'admin'],
  scope: 'self',
  naturalKey: ['title', 'agency', 'sanctionYear'],
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

    { key: 'agency', label: 'Name of the funding agency', type: 'text', required: true,
      maxLength: 240, section: 'Funding', placeholder: 'SERB, DST',
      exportAs: { faculty: 'Name of the funding agency', drie: 'Name of the funding agency' } },

    { key: 'agencyCategory', label: 'Category of Funding Agency', type: 'select', required: true,
      listKey: 'agencyCategories', section: 'Funding',
      exportAs: {
        faculty: 'Category of Funding Agency  (Government / Non-Government)',
        drie: 'Category of Funding Agency  (Government / Non-Government)',
      } },

    { key: 'duration', label: 'Duration', type: 'text', required: true, maxLength: 60,
      section: 'Funding', placeholder: '3 years',
      exportAs: { faculty: 'Duration', drie: 'Duration' } },

    { key: 'sanctionYear', label: 'Year of award or sanction', type: 'year', required: true,
      min: 1990, max: 2100, section: 'Funding',
      exportAs: {
        faculty: 'Year of award or sanction (FY 2024, 2023, 2022)',
        drie: 'Year of award or sanction',
      } },

    { key: 'amount', label: 'Amount in INR.', type: 'money', required: true, min: 0,
      section: 'Funding', placeholder: '4820000',
      help: 'Digits only — BITWISE formats it as ₹ 48,20,000.',
      exportAs: { faculty: 'Amount in INR.', drie: 'Amount in INR.' } },

    { key: 'evidence', label: 'Attach documents (Project Sanction letter)', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Evidence',
      exportAs: {
        faculty: 'Attach documents (Project Sanction letter)',
        drie: 'Attach documents (Project Sanction letter)',
      } },
  ],
  listColumns: ['title', 'agency', 'role', 'agencyCategory', 'amount', 'sanctionYear'],
  defaultSort: { key: 'sanctionYear', dir: 'desc' },
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
