import type { Role } from './modules/_types';

export const ROLE_LABEL: Record<Role, string> = {
  faculty: 'Faculty',
  hod: 'Head of Department',
  dofa: 'DOFA — Dean of Faculty Affairs',
  drie: 'DRIE — Dean of Research, Innovation & Entrepreneurship',
  dugs: 'DUGS / DPGS — Dean of UG & PG Studies',
  cdc: 'CDC — Career Development Centre',
  admin: 'IQAC Administrator',
};

export const ROLE_SHORT: Record<Role, string> = {
  faculty: 'Faculty',
  hod: 'HOD',
  dofa: 'DOFA',
  drie: 'DRIE',
  dugs: 'DUGS/DPGS',
  cdc: 'CDC',
  admin: 'IQAC',
};

/** What each role is told the portal is for, on their overview page. */
export const ROLE_PURPOSE: Record<Role, string> = {
  faculty: 'Enter your own records once. Every total on your profile is computed from them.',
  hod: 'Your department’s records, plus the five modules the department itself owns.',
  dofa: 'Verify faculty-affairs records from every department, and own the quality-assurance module.',
  drie: 'Verify research records from every department before IQAC signs them off.',
  dugs: 'Verify mentorship, workshops, e-content and curriculum feedback across the institute.',
  cdc: 'Record students qualifying competitive examinations, institute-wide.',
  admin: 'Approve verified records, manage accounts and lists, and export the workbooks.',
};
