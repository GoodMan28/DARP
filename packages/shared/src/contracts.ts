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
  /** The default year range (a saved range, else the last three years). It never hides a record. */
  cycle: { name: string; from: number; to: number };
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
  /** Records this person returned that have been corrected and are waiting for a second look. */
  corrections: CorrectionRow[];
  /** Patents the journal moved forward in the last 30 days. */
  autoUpdates: AutoUpdateRow[];
}

/** A patent the Patent Office Journal moved forward by itself (shown on its owner's dashboard). */
export interface AutoUpdateRow {
  id: string; moduleKey: string; at: string; text: string;
}

export interface CorrectionRow {
  id: string; moduleKey: string; moduleName: string; title: string; ownerName: string; correctedAt: string;
  /** Labels of the fields changed since the return; empty when resubmitted without changes. */
  changed: string[];
}

/* ──────────────────────────────── profile ─────────────────────────────── */

/** 'today': records still valid today (an award within its validity), whatever their year. */
export type CounterWindow = 'cycle' | 'sinceJoining' | 'today';

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
  /** The years counted ("cycle" figures); "since joining" figures ignore it. */
  range: { from: number; to: number };
  /** The first year a range can start from: the oldest record, or ten years back. */
  minYear: number;
  maxYear: number;
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
  /** What a dropdown's empty choice says, when empty means something. */
  emptyLabel?: string | null;
  /** Drawn inside a card of its own (the journal ranking), not in the field list. */
  custom?: string | null;
  /** An institute field that refuses BIT Mesra itself (places outside BIT). */
  excludeHome?: boolean;
  showIf: { field: string; in?: string[]; notIn?: string[] } | null;
  /** Worked out by the server, shown read-only (see packages/shared/src/computed.ts). */
  computed?: import('./computed').ComputedRule | null;
  /** Not shown on the form. */
  hidden?: boolean;
  section: string | null;
  colSpan: number;
  maxLength: number | null;
  accept: string[] | null;
  maxSizeMB: number | null;
  /** A date or year that cannot be later than today. */
  notFuture: boolean;
  /** Shown after a number input, e.g. 'years'. */
  unit: string | null;
  protected: boolean;
  /**
   * Filled from an external register. `locked` fields are shown locked after a lookup, with a
   * Change button; `alwaysLocked` (set by the system) and `generated` (the citation, rebuilt from
   * the other fields) can never be changed.
   */
  autofill: { locked: boolean; alwaysLocked: boolean; generated: boolean } | null;
}

/** GET /api/modules/:moduleKey/schema — the module's shape plus the caller's standing in it. */
export interface ModuleSchemaPayload {
  /** The columns the Filter, Sort, Group and Hide fields tools offer for this module. */
  viewColumns: import('./views').ViewColumn[];
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
  /** The cycle's own periods, newest first. */
  periods: PeriodOption[];
  /** Every period the records the caller can see are filed under, the cycle's or not, newest first. */
  recordPeriods: PeriodOption[];
  counts: StatusCounts;
  /** Years this person declared "nothing to report" for in this module. */
  declaredYears: number[];
  /** The years the declaration can be made for (the default range's years, newest first). */
  declarableYears: number[];
  /** Present when the module fetches its facts from a register (DOI / ISBN / patent number). */
  lookup: { kind: LookupKind; idFields: string[]; idLabel: string; sourceName: string } | null;
  fields: FormFieldDef[];
  /** Values worked out when read, never typed (the journal's indexing, quartile, Impact Factor). */
  derived: Array<{ key: string; label: string }>;
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
  /** The module's derived values as text, by key ("Q1 SJR · IF 5.2", "NA"); {} for a module with none. */
  derived: Record<string, string>;
  /** A returned record: who sent it back and when (so a viewer who is not the owner sees why it waits). */
  returnedByRole: Role | null;
  returnedAt: string | null;
  /** A profile roster row for someone who has not saved a profile yet: `id` is then the person's user id. */
  noRecord?: boolean;
  /** The group the row is under, when the view groups ("Computer Science & Engg.", "Approved"). */
  group?: string | null;
}

/** GET /api/modules/:moduleKey/records */
export interface RecordListPayload {
  total: number;
  page: number;
  pageSize: number;
  rows: RecordListRow[];
  /** When grouped: every group's size across all pages, in order. */
  groups?: Array<{ label: string; count: number }>;
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
  /** The record's own department (not the viewer's); null for an institute-wide record. */
  departmentName: string | null;
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
  /** The module's derived values as text, by key; {} for a module with none. */
  derived: Record<string, string>;
  /** Changes made after the first submission, newest first (everyone who can open the record). */
  edits: RecordEditEntry[];
  /** The server's answer: may this viewer delete the record, and must they say why? */
  canDelete: boolean;
  deleteNeedsReason: boolean;
  /** A returned record: who sent it back and when. */
  returnedByRole: Role | null;
  returnedAt: string | null;
  /** Fields whose date was estimated from a year, or that still need entering (after the October 2026 change). */
  estimatedDates: string[];
  needsInput: string[];
}

export interface RecordEditEntry {
  at: string;
  actorName: string;
  note: string | null;
  changes: Array<{ key: string; label: string; from: string; to: string }>;
}

/* ── automatic lookup (DOI / ISBN / patent number) ─────────────────── */

export type LookupSource = 'crossref' | 'datacite' | 'openlibrary' | 'ipindia';

/** Stored on a record (records.verification) and returned with it. */
export interface RecordVerification {
  /** null = the details were typed by hand. */
  source: LookupSource | null;
  identifier: string | null;
  checkedAt: string;
  autoApproved: boolean;
  /** What the verifying office and IQAC should check. Empty when every check passed. */
  reasons: string[];
  /**
   * Fields the owner changed from the publisher's record, or typed because nothing was found —
   * worked out by the server by comparing the saved values with the record it fetched, so they
   * cannot be hidden. Fields not listed came from the publisher unchanged.
   */
  fields?: Record<string, FieldProvenance>;
  /** How sure the portal is that the owner is one of the authors or inventors. Never blocks a submission. */
  authorship?: Authorship;
}

/**
 * confirmed: the owner's checked ORCID iD is on the published record.
 * likely:    the owner's name matches a listed author or inventor at BIT Mesra.
 * name:      the name matches, but the affiliation is unknown or another institution.
 * unmatched: nobody listed matches; the owner added their name by hand.
 */
export type AuthorshipLevel = 'confirmed' | 'likely' | 'name' | 'unmatched';

export interface Authorship {
  level: AuthorshipLevel;
  /** One sentence for DRIE and IQAC, e.g. "ORCID iD 0000-0002-1825-0097 is on the paper." */
  detail: string;
}

export const AUTHORSHIP_LABEL: Record<AuthorshipLevel, string> = {
  confirmed: 'Confirmed by ORCID',
  likely: 'Likely: name and BIT Mesra',
  name: 'Name only',
  unmatched: 'Needs checking',
};

/** What ORCID's public record said about an iD when it was saved. */
export interface OrcidCheck {
  checkedAt: string;
  /** The record exists on orcid.org. */
  found: boolean;
  /** The name on the ORCID record (or one of its other names) is the account's name. */
  nameMatches: boolean;
  /** An employment at BIT Mesra is listed. */
  bitEmployment: boolean;
  /** The name as ORCID shows it, for the person to compare. */
  orcidName: string;
  /** ORCID could not be reached: saved unchecked, and not used until checked again. */
  unchecked?: boolean;
  /** The other IDs the ORCID record lists ("Other IDs" on orcid.org): Scopus Author IDs and ResearcherIDs. */
  externalIds?: { scopusAuthorIds: string[]; researcherIds: string[] };
}

/** GET /api/profile/identity */
export interface IdentityPayload {
  namePrefix: string;
  firstName: string;
  middleName: string;
  lastName: string;
  orcid: string | null;
  orcidCheck: OrcidCheck | null;
}

export interface FieldProvenance {
  origin: 'changed' | 'typed';
  /** The publisher's value; '' when nothing was found. */
  fetched: string;
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
  ipindia: 'the Patent Office Journal (IP India)',
};

/* ── Adding many records at once from a file of DOIs, ISBNs or patent numbers ── */

/**
 * What became of one identifier in the file. Every one but `exists` has a draft for the owner to
 * complete (the faculty member is trusted); the status says what the check found:
 *  created       filled from the register, nothing to add
 *  exists        already recorded (by the owner, with a link, or by a colleague): no draft
 *  not-found     not in the register: the draft holds only the number
 *  wrong-module  it belongs in another module: the draft is made there (a preprint belongs nowhere: no draft)
 *  not-yours     the owner's name is not in its author or inventor list: they add it on the draft
 *  error         could not be checked (register unreachable: draft holds the number; upload cut off: none)
 */
export type BulkItemStatus = 'pending' | 'created' | 'exists' | 'not-found' | 'wrong-module' | 'not-yours' | 'error';

export interface BulkItem {
  id: string;
  raw: string;
  status: BulkItemStatus;
  message: string | null;
  /** The record made (or found already made), while it exists. */
  record: {
    id: string;
    /** A line that belongs in another module has its draft there. */
    moduleKey: string;
    moduleName: string;
    status: RecordStatus;
    mine: boolean;
    title: string;
    /** The module's evidence field, for the upload box on the row. */
    evidence: { fieldKey: string; label: string; accept: string[] | null; maxSizeMB: number } | null;
    /** The evidence file on the draft, if any. */
    evidenceId: string | null;
    /** Submitting needs an evidence file: always in some modules, else when something is unconfirmed. */
    needsEvidence: boolean;
    /** What the automatic check could not confirm. */
    points: string[];
    /** "Were you affiliated to BIT when it was published?": null when the module does not ask, '' while unanswered. */
    affiliation: string | null;
  } | null;
}

/** GET /api/modules/:moduleKey/bulk/:id */
export interface BulkImport {
  id: string;
  moduleKey: string;
  fileName: string;
  status: 'running' | 'done' | 'failed';
  total: number;
  done: number;
  createdAt: string;
  items: BulkItem[];
}

/** POST /api/modules/:moduleKey/bulk/:id/submit: one per record. */
export interface BulkSubmitResult {
  recordId: string;
  ok: boolean;
  status: RecordStatus | null;
  message: string | null;
}
