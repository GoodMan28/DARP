/**
 * The API contract: the shape of every response the web tier reads.
 *
 * The API builds these from its services and the web tier renders them, so this file is
 * the one place both sides agree on. Dates cross the wire as ISO strings, which is what
 * `Jsonify<T>` expresses: the API checks at compile time that `Jsonify<what it returns>`
 * still matches these types (apps/api/src/contracts-check.ts), so a service change that
 * would break a page fails `npm run typecheck` instead of failing in the browser.
 */
import type {
  ModuleConfig, PeriodType, RecordStatus, Role, LookupKind,
} from './modules/_types';

/** What a value looks like after `JSON.stringify` → `JSON.parse`. */
export type Jsonify<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

/* ─────────────────────────────── envelope ─────────────────────────────── */

export interface ApiFailure {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

/* ─────────────────────────── the signed-in user ───────────────────────── */

export type Capability = 'manageUsers' | 'manageLists' | 'manageCycle' | 'viewAudit' | 'export' | 'revealPii';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  dateOfJoining: string | null;
  mustChangePassword: boolean;
}

export interface SidebarItem {
  key: string;
  name: string;
  href: string;
  count?: number;
}

export interface SidebarGroup {
  name: string;
  items: SidebarItem[];
}

export interface ActiveCycleInfo {
  /** Empty when IQAC has not opened a cycle. */
  id: string;
  name: string;
  deadlineAt: string | null;
}

/** GET /api/me — everything the app shell needs on every signed-in page. */
export interface MePayload {
  user: CurrentUser;
  capabilities: Record<Capability, boolean>;
  cycle: ActiveCycleInfo;
  groups: SidebarGroup[];
}

/* ─────────────────────────────── dashboard ────────────────────────────── */

export type ModuleProgress = 'not_started' | 'in_progress' | 'submitted' | 'verified' | 'approved';

export interface ModuleStatusRow {
  key: string;
  name: string;
  group: string;
  periodType: string;
  total: number;
  /** Rows still in the owner's hands: `draft` plus `returned`. */
  drafts: number;
  submitted: number;
  verified: number;
  approved: number;
  declaredNil: boolean;
  progress: ModuleProgress;
}

export interface DepartmentCompletionRow {
  departmentId: string;
  departmentCode: string;
  department: string;
  facultyTotal: number;
  facultyReporting: number;
  records: number;
  modulesComplete: number;
  modulesApplicable: number;
  pct: number;
}

export interface VerificationQueueRow {
  moduleKey: string;
  name: string;
  awaitingVerification: number;
  awaitingApproval: number;
}

/** GET /api/dashboard */
export interface DashboardPayload {
  cycle: { name: string; deadlineAt: string | null; entryOpensAt: string | null } | null;
  role: Role;
  /** Whether this role fills in any module itself (faculty, HOD, the offices — not every role). */
  ownsModules: boolean;
  /** The modules the caller must fill in themselves, with their progress. */
  modules: ModuleStatusRow[];
  summary: { total: number; notStarted: number; inProgress: number; done: number; pct: number };
  /** What the caller's office still has to act on. Empty for roles that verify nothing. */
  queue: VerificationQueueRow[];
  /** Completion by department. Empty for faculty. */
  departments: DepartmentCompletionRow[];
}

/* ──────────────────────────────── profile ─────────────────────────────── */

export type CounterWindow = 'cycle' | 'sinceJoining';

export interface DeclaredCounterDef {
  key: string;
  label: string;
  help: string;
  format: 'number' | 'yesno';
}

export interface ComputedCounter {
  key: string;
  label: string;
  value: number;
  format: 'number' | 'money';
  window: CounterWindow;
  moduleKey: string;
  moduleName: string;
  /** How much of `value` came from the manually-entered pre-portal figure. */
  baseline: number;
}

export interface DeclaredCounter extends DeclaredCounterDef {
  value: number;
}

/** GET /api/profile/rollups */
export interface CounterValues {
  userId: string;
  computed: ComputedCounter[];
  declared: DeclaredCounter[];
}

/* ──────────────────────────────── modules ─────────────────────────────── */

export interface PeriodOption {
  year: number;
  label: string;
}

export type StatusCounts = Record<RecordStatus, number>;

/** One form field as the browser sees it: the shape, never the protection mechanism. */
export interface FormFieldDef {
  key: string;
  label: string;
  type: string;
  required: boolean;
  help: string | null;
  placeholder: string | null;
  options: string[];
  showIf: { field: string; in: string[] } | null;
  section: string | null;
  colSpan: number;
  maxLength: number | null;
  accept: string[] | null;
  maxSizeMB: number | null;
  protected: boolean;
  /** Filled from an external register; `locked` fields cannot be edited after a lookup. */
  autofill: { locked: boolean; alwaysLocked: boolean } | null;
}

/** GET /api/modules/:moduleKey/schema — the module's shape plus the caller's standing in it. */
export interface ModuleSchemaPayload {
  key: string;
  name: string;
  group: ModuleConfig['group'];
  description: string;
  periodType: PeriodType;
  naacRef: string | null;
  bodies: ModuleConfig['bodies'];
  scope: ModuleConfig['scope'];
  canCreate: boolean;
  canVerify: boolean;
  listColumns: string[];
  periods: PeriodOption[];
  counts: StatusCounts;
  declaredNil: boolean;
  /** Present when the module fetches its facts from a register (DOI / ISBN). */
  lookup: { kind: LookupKind; idFields: string[]; idLabel: string } | null;
  fields: FormFieldDef[];
}

export interface RecordListRow {
  id: string;
  status: RecordStatus;
  periodLabel: string;
  periodYear: number;
  ownerName: string;
  isMine: boolean;
  returnedRemark: string | null;
  updatedAt: string;
  data: Record<string, unknown>;
  /** Approved automatically, but with details that could not be confirmed: worth a look. */
  needsCheck: boolean;
}

/** GET /api/modules/:moduleKey/records */
export interface RecordListPayload {
  total: number;
  page: number;
  pageSize: number;
  rows: RecordListRow[];
}

export interface RecordHistoryEntry {
  fromStatus: string;
  toStatus: string;
  remark: string | null;
  at: string;
  actorRole: Role;
  actorName: string;
}

/** GET /api/modules/:moduleKey/records/:id */
export interface RecordDetail {
  id: string;
  status: RecordStatus;
  periodLabel: string;
  periodYear: number;
  returnedRemark: string | null;
  updatedAt: string;
  ownerUserId: string;
  ownerName: string;
  isMine: boolean;
  canEdit: boolean;
  data: Record<string, unknown>;
  /** Raw values for the form — present only for someone who may edit. */
  editValues: Record<string, unknown> | null;
  history: RecordHistoryEntry[];
  /** How the record was checked; null for records entered before automatic checks existed. */
  verification: RecordVerification | null;
  /** Fields the edit form must show as locked. */
  lockedFields: string[];
}

/* ── automatic lookup (DOI / ISBN) ─────────────────────────────────── */

export type LookupSource = 'crossref' | 'datacite' | 'openlibrary';

/** Stored on a record (records.verification) and returned with it. */
export interface RecordVerification {
  /** null = the details were typed by hand. */
  source: LookupSource | null;
  identifier: string | null;
  checkedAt: string;
  autoApproved: boolean;
  /** Why it was NOT approved automatically. Empty when it was. */
  reasons: string[];
}

/** POST /api/lookup/:moduleKey */
export interface LookupFillPayload {
  found: boolean;
  source: LookupSource | null;
  authoritative: boolean;
  /** field key → value to put in the form */
  fill: Record<string, string>;
  /** field keys the form must show as locked */
  locked: string[];
  /** plain-language notes for the person filling in */
  notes: string[];
  /** The work belongs in another module: its key and name, for an "Add it there" link. */
  moveTo?: { moduleKey: string; name: string } | null;
}

export const LOOKUP_SOURCE_LABEL: Record<LookupSource, string> = {
  crossref: 'Crossref',
  datacite: 'DataCite',
  openlibrary: 'Open Library',
};
