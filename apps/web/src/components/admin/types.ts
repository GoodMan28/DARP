import type { Role } from '@darp/shared/modules/types';

/* Shapes returned by the /api/admin/* routes. Kept in one place so every panel
   agrees with the server, and so no panel invents a field the server never sends. */

export interface AdminUserRow {
  id: string;
  name: string;
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
  value: string;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
}

export interface MasterListGroup {
  listKey: string;
  usedBy: string[];
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

export type AdminTab = 'accounts' | 'lists' | 'journals' | 'cycle' | 'deleted' | 'audit' | 'exports';

export const ADMIN_TABS: ReadonlyArray<{ key: AdminTab; label: string }> = [
  { key: 'accounts', label: 'Accounts' },
  { key: 'lists', label: 'Master lists' },
  { key: 'journals', label: 'Journal lists' },
  { key: 'cycle', label: 'Year ranges' },
  { key: 'deleted', label: 'Deleted records' },
  { key: 'audit', label: 'Audit log' },
  { key: 'exports', label: 'Exports' },
];

export function isAdminTab(value: string | undefined): value is AdminTab {
  return ADMIN_TABS.some((t) => t.key === value);
}

/** GET /api/admin/journal-lists */
export interface JournalListsPayload {
  /** source 'scimago' = loaded by IQAC; 'scopus-list' = computed automatically. */
  sjr: Array<{ year: number; source: string; issns: number; ranked: number }>;
  /** source 'upload' = loaded by IQAC; 'scopus-list' = fetched automatically. */
  lists: Array<{ listName: string; year: number; source: string; issns: number }>;
  /** Journal Citation Reports exports (Impact Factor), one entry per JIF year. */
  jcr: Array<{ jifYear: number; issns: number; withJif: number }>;
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
