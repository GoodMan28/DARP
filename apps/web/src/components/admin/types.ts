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

export interface CycleRow {
  id: string;
  name: string;
  isActive: boolean;
  cyStart: string;
  cyEnd: string;
  fyStart: string;
  fyEnd: string;
  ayStart: string;
  ayEnd: string;
  entryOpensAt: string | null;
  deadlineAt: string | null;
  createdAt?: string;
}

export interface CyclesPayload {
  cycles: CycleRow[];
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

export type AdminTab = 'accounts' | 'lists' | 'cycle' | 'audit' | 'exports';

export const ADMIN_TABS: ReadonlyArray<{ key: AdminTab; label: string }> = [
  { key: 'accounts', label: 'Accounts' },
  { key: 'lists', label: 'Master lists' },
  { key: 'cycle', label: 'Cycle' },
  { key: 'audit', label: 'Audit log' },
  { key: 'exports', label: 'Exports' },
];

export function isAdminTab(value: string | undefined): value is AdminTab {
  return ADMIN_TABS.some((t) => t.key === value);
}
