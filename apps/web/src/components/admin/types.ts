import type { Role } from '@darp/shared/modules/types';

/* Shapes returned by the /api/admin/* routes. Kept in one place so every panel
   agrees with the server, and so no panel invents a field the server never sends. */

export interface AdminUserRow {
  id: string;
  /** Composed from the four parts below. */
  name: string;
  namePrefix: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  role: Role;
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  employeeId: string | null;
  dateOfJoining: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface UsersPayload {
  users: AdminUserRow[];
  departments: DepartmentRow[];
}

export interface CreatedUserPayload {
  user: { id: string; name: string; email: string; role: Role };
  temporaryPassword: string;
}

export interface ResetPayload {
  user: { id: string; name: string };
  temporaryPassword?: string;
}

export interface MasterListItem {
  id: string;
  listKey: string;
  /** The item of the parent list it belongs to; '' for a plain list. */
  parent: string;
  value: string;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
}

export interface MasterListGroup {
  listKey: string;
  usedBy: string[];
  /** The list its items belong under (specialisations under programmes), or null. */
  parentList: string | null;
  items: MasterListItem[];
}

export interface MasterListsPayload {
  lists: MasterListGroup[];
}

export interface RangeRow {
  id: string;
  name: string;
  isDefault: boolean;
  from: number;
  to: number;
}

export interface RangesPayload {
  ranges: RangeRow[];
}

export interface AuditEntry {
  id: number;
  at: string;
  actorUserId: string | null;
  actorRole: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  before: unknown;
  after: unknown;
  meta: unknown;
}

export interface AuditPayload {
  entries: AuditEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filters: {
    actions: readonly string[];
    entities: readonly string[];
    actors: Array<{ id: string; name: string; email: string }>;
  };
}

export type AdminTab = 'accounts' | 'departments' | 'lists' | 'journals' | 'cycle' | 'deleted' | 'audit' | 'exports';

/** In the order IQAC needs them most. Each says in one line what it is for. */
export const ADMIN_TABS: ReadonlyArray<{ key: AdminTab; label: string; about: string }> = [
  { key: 'accounts', label: 'Accounts', about: 'Who can sign in: add a person, correct a name or role, reset a password, or switch an account off.' },
  { key: 'journals', label: 'Journal & patent data', about: 'Upload the Web of Science, SCImago and Impact Factor files that papers are checked against, and see that Scopus and patents are up to date.' },
  { key: 'cycle', label: 'Year ranges', about: 'Named spans of years, such as “NAAC Cycle 4: 2022 to 2024”, that numbers and reports start with.' },
  { key: 'exports', label: 'Reports', about: 'Download records for any span of years: IQAC’s own formats filled in, or full data, by year type and department. Every level (faculty, heads of department, offices) has the same page under Reports.' },
  { key: 'departments', label: 'Departments', about: 'BIT’s departments and centres: add one, rename one, or switch one off.' },
  { key: 'lists', label: 'Dropdown options', about: 'The choices people see in each form’s dropdowns, such as agency categories or indexing types.' },
  { key: 'deleted', label: 'Deleted records', about: 'Records people deleted, with their reasons. Restore one deleted by mistake.' },
  { key: 'audit', label: 'Activity log', about: 'Who did what, and when: every sign-in, change, upload and export.' },
];

export function isAdminTab(value: string | undefined): value is AdminTab {
  return ADMIN_TABS.some((t) => t.key === value);
}

/** GET /api/admin/journal-lists */
export interface JournalListsPayload {
  /** source 'scimago' = loaded by IQAC; 'scopus-list' = computed automatically. */
  sjr: Array<{ year: number; source: string; issns: number; ranked: number; importedAt: string | null }>;
  /** source 'upload' = loaded by IQAC; 'scopus-list' = fetched automatically. */
  lists: Array<{ listName: string; year: number; source: string; issns: number; importedAt: string | null }>;
  /** Journal Citation Reports exports (Impact Factor), one entry per JIF year. */
  jcr: Array<{ jifYear: number; issns: number; withJif: number; importedAt: string | null }>;
  /** The automatic copy of Elsevier's public Scopus list, or null before the first fetch. */
  scopus: {
    file: string; listYear: number; listMonth: number; sjrYear: number;
    journals: number; indexed: number; ranked: number; fetchedAt: string;
    discontinued?: number; checkedAt?: string;
  } | null;
  /** The Indexing master list, in IQAC's priority order. */
  listNames: string[];
  /** The index of the Patent Office Journal that patent numbers are fetched from. */
  patents: PatentIndexStatus;
}

export interface PatentIndexStatus {
  fromYear: number;
  partsListed: number | null;
  partsIndexed: number;
  partsFailed: number;
  applications: number;
  grants: number;
  newestIssue: { issue: string; date: string } | null;
  oldestIssue: { issue: string; date: string } | null;
  running: boolean;
  checkedAt: string | null;
  lastError: string | null;
}
