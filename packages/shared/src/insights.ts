import type { Role } from './modules/_types';

/**
 * Who sees the department, college and person pages. The server decides with these; the pages only
 * follow what the server answers.
 */

/** The roles that see the whole college and every department (the deans and IQAC). */
export const COLLEGE_ROLES: readonly Role[] = ['dofa', 'drie', 'dugs', 'admin'];
export const canSeeCollege = (role: Role): boolean => COLLEGE_ROLES.includes(role);

/** Faculty and HODs see their own department only; the deans and IQAC see every department. CDC sees none. */
export function canSeeDepartment(user: { role: Role; departmentId: string | null }, departmentId: string): boolean {
  if (canSeeCollege(user.role)) return true;
  return (user.role === 'faculty' || user.role === 'hod') && !!user.departmentId && user.departmentId === departmentId;
}

/** A person's page: themselves, their department's colleagues, and the deans and IQAC. */
export function canSeePerson(
  viewer: { id: string; role: Role; departmentId: string | null },
  person: { id: string; departmentId: string | null },
): boolean {
  if (viewer.id === person.id || canSeeCollege(viewer.role)) return true;
  return !!person.departmentId && canSeeDepartment(viewer, person.departmentId);
}

/** What the department h-index counts: every paper (the default), or only papers done at BIT. */
export type HIndexPapers = 'all' | 'at-bit';
export const HINDEX_PAPERS: readonly HIndexPapers[] = ['all', 'at-bit'];
