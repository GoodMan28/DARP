import {
  pgTable, pgEnum, uuid, text, boolean, integer, bigint, bigserial,
  jsonb, date, timestamp, index, uniqueIndex, check, primaryKey,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';

/* ───────────────────────────── enums ───────────────────────────── */

export const roleEnum = pgEnum('role', [
  'faculty', 'hod', 'dofa', 'drie', 'dugs', 'cdc', 'admin',
]);

export const recordStatusEnum = pgEnum('record_status', [
  'draft', 'submitted', 'verified', 'approved', 'returned',
]);

/* ─────────────────────────── departments ───────────────────────── */

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),                       // e.g. 'CSE'
  name: text('name').notNull(),                       // 'Computer Science & Engg.'
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('departments_code_uq').on(t.code),
]);

/* ──────────────────────────────  users ─────────────────────────── */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull(),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'restrict' }),
  employeeId: text('employee_id'),
  /** Required for every "since joining BIT" counter. */
  dateOfJoining: date('date_of_joining'),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
  index('users_department_idx').on(t.departmentId),
  index('users_role_idx').on(t.role),
  // A faculty/hod account must belong to a department; office accounts need not.
  check(
    'users_department_rule',
    sql`(${t.role} in ('faculty','hod') and ${t.departmentId} is not null)
        or (${t.role} in ('dofa','drie','dugs','cdc','admin'))`,
  ),
]);

/* ───────────────────────────── sessions ────────────────────────── */
/** `id` is the SHA-256 hash of the cookie value. The raw value is never stored,
 *  so a database dump cannot be replayed as a login. */
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ip: text('ip'),
  userAgent: text('user_agent'),
}, (t) => [
  index('sessions_user_idx').on(t.userId),
  index('sessions_expiry_idx').on(t.absoluteExpiresAt),
]);

/* ───────────────────── password resets & attempts ──────────────── */

export const passwordResets = pgTable('password_resets', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('password_resets_user_idx').on(t.userId)]);

export const loginAttempts = pgTable('login_attempts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  emailLower: text('email_lower').notNull(),
  ip: text('ip').notNull(),
  success: boolean('success').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('login_attempts_email_at_idx').on(t.emailLower, t.at),
  index('login_attempts_ip_at_idx').on(t.ip, t.at),
]);

/* ────────────────────────────── cycles ─────────────────────────── */
/** Decision #1: one active cycle — NAAC Cycle 4, data years 2022–2024,
 *  with a window per period type so CY/FY/AY never get mixed up. */
export const cycles = pgTable('cycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),                    // 'NAAC Cycle 4 · 2022–2024'
  isActive: boolean('is_active').notNull().default(false),
  cyStart: date('cy_start').notNull(),             // 2022-01-01
  cyEnd: date('cy_end').notNull(),                 // 2024-12-31
  fyStart: date('fy_start').notNull(),             // 2022-04-01
  fyEnd: date('fy_end').notNull(),                 // 2025-03-31
  ayStart: date('ay_start').notNull(),             // 2022-07-01
  ayEnd: date('ay_end').notNull(),                 // 2025-06-30
  entryOpensAt: timestamp('entry_opens_at', { withTimezone: true }),
  deadlineAt: timestamp('deadline_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // At most one active cycle, enforced by the database.
  uniqueIndex('cycles_one_active_uq').on(t.isActive).where(sql`${t.isActive} = true`),
]);

/* ───────────────────────────── records ─────────────────────────── */

export const records = pgTable('records', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleKey: text('module_key').notNull(),
  cycleId: uuid('cycle_id').notNull().references(() => cycles.id, { onDelete: 'restrict' }),

  /** Who owns the record. Always set — even office-scoped modules have a creating user. */
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  /** Null only for institute-scoped modules (quality, exams). */
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'restrict' }),

  status: recordStatusEnum('status').notNull().default('draft'),

  /** Human label of the reporting period, e.g. '2024', 'FY 2024-25', 'AY 2024-25'. */
  periodLabel: text('period_label').notNull(),
  /** Numeric year used for window filtering; the starting year of the period. */
  periodYear: integer('period_year').notNull(),

  /** Normalised duplicate guard, e.g. 'doi:10.1016/j.future.2026.107812'. Null = no guard. */
  naturalKey: text('natural_key'),

  data: jsonb('data').notNull().default(sql`'{}'::jsonb`),
  /** Lower-cased concatenation of non-sensitive field values, for search. */
  searchText: text('search_text').notNull().default(''),
  /** How the record's facts were checked (RecordVerification). Null = before automatic checks. */
  verification: jsonb('verification'),

  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedBy: uuid('verified_by').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
  returnedRemark: text('returned_remark'),

  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: uuid('deleted_by').references(() => users.id, { onDelete: 'set null' }),
}, (t) => [
  index('records_module_cycle_idx').on(t.moduleKey, t.cycleId, t.status),
  index('records_owner_idx').on(t.ownerUserId, t.moduleKey),
  index('records_dept_idx').on(t.departmentId, t.moduleKey),
  index('records_status_idx').on(t.status),
  index('records_live_idx').on(t.moduleKey, t.cycleId).where(sql`${t.deletedAt} is null`),
  index('records_data_gin').using('gin', t.data),
  index('records_search_trgm').using('gin', sql`${t.searchText} gin_trgm_ops`),
  // Duplicate guard: one live record per natural key per module per cycle.
  uniqueIndex('records_natural_key_uq')
    .on(t.moduleKey, t.cycleId, t.naturalKey)
    .where(sql`${t.naturalKey} is not null and ${t.deletedAt} is null`),
  // Exactly one profile record per user per cycle.
  uniqueIndex('records_one_profile_uq')
    .on(t.ownerUserId, t.cycleId)
    .where(sql`${t.moduleKey} = 'profile' and ${t.deletedAt} is null`),
  // Curriculum Feedback (1.4.1) is one answer per department per cycle — the HOD
  // picks one option from A–E, so a second row would be a contradiction.
  uniqueIndex('records_one_feedback_uq')
    .on(t.departmentId, t.cycleId)
    .where(sql`${t.moduleKey} = 'feedback' and ${t.deletedAt} is null`),
  check('records_period_year_rule', sql`${t.periodYear} between 1950 and 2100`),
]);

/* ──────────────────── workflow transition history ──────────────── */

export const recordTransitions = pgTable('record_transitions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  recordId: uuid('record_id').notNull().references(() => records.id, { onDelete: 'cascade' }),
  fromStatus: recordStatusEnum('from_status').notNull(),
  toStatus: recordStatusEnum('to_status').notNull(),
  actorUserId: uuid('actor_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  actorRole: roleEnum('actor_role').notNull(),
  remark: text('remark'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('record_transitions_record_idx').on(t.recordId, t.at)]);

/* ───────────────────────── evidence files ──────────────────────── */

export const evidenceFiles = pgTable('evidence_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  recordId: uuid('record_id').references(() => records.id, { onDelete: 'cascade' }),
  /** Which file field of the module this belongs to, e.g. 'sanctionLetter'. */
  fieldKey: text('field_key').notNull(),
  /** Opaque relative path inside EVIDENCE_DIR. Never derived from user input. */
  storageKey: text('storage_key').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sha256: text('sha256').notNull(),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('evidence_record_idx').on(t.recordId),
  uniqueIndex('evidence_storage_key_uq').on(t.storageKey),
  check('evidence_size_rule', sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 5242880`),
]);

/* ─────────────────────────── master lists ──────────────────────── */
/** Runtime-editable dropdowns (indexing types, award levels, agency categories …). */
export const masterListItems = pgTable('master_list_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  listKey: text('list_key').notNull(),
  value: text('value').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('master_list_value_uq').on(t.listKey, t.value),
  index('master_list_key_idx').on(t.listKey, t.sortOrder),
]);

/* ──────────────────── nil-return declarations ──────────────────── */
/** Lets someone with nothing to report mark a module complete
 *  ("no patents this cycle"), which completion tracking needs. */
export const moduleDeclarations = pgTable('module_declarations', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleKey: text('module_key').notNull(),
  cycleId: uuid('cycle_id').notNull().references(() => cycles.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  declaredNil: boolean('declared_nil').notNull().default(true),
  declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('module_declarations_uq').on(t.moduleKey, t.cycleId, t.userId),
]);

/* ───────────────────────── profile baselines ───────────────────── */
/** Decision #6: no historical import in v1, so "since joining BIT" counters
 *  add a manually-entered baseline to what the portal holds. Zeroed after import. */
export const profileBaselines = pgTable('profile_baselines', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  counterKey: text('counter_key').notNull(),      // e.g. 'publications.count.sinceJoining'
  value: bigint('value', { mode: 'number' }).notNull().default(0),
  setBy: uuid('set_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('profile_baselines_uq').on(t.userId, t.counterKey),
  check('profile_baselines_non_negative', sql`${t.value} >= 0`),
]);

/* ────────────────────────── audit log ──────────────────────────── */
/** Append-only. scripts/harden-db.ts adds a trigger and revokes UPDATE/DELETE from the app user. */
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  actorUserId: uuid('actor_user_id'),
  actorRole: text('actor_role'),
  action: text('action').notNull(),          // 'record.create', 'auth.login.fail', 'pii.reveal' …
  entity: text('entity').notNull(),          // 'record' | 'user' | 'evidence' | 'session' | 'export'
  entityId: text('entity_id'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  before: jsonb('before'),
  after: jsonb('after'),
  meta: jsonb('meta'),
}, (t) => [
  index('audit_at_idx').on(t.at),
  index('audit_actor_idx').on(t.actorUserId, t.at),
  index('audit_entity_idx').on(t.entity, t.entityId),
  index('audit_action_idx').on(t.action, t.at),
]);

/* ─────────────── external lookups (DOI / ISBN) and journal lists ─────────────── */

/** One fetched result per identifier. Found results are reused for 30 days, misses for 1 day. */
export const lookupCache = pgTable('lookup_cache', {
  kind: text('kind').notNull(),
  lookupKey: text('lookup_key').notNull(),
  found: boolean('found').notNull(),
  result: jsonb('result').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.kind, t.lookupKey] })]);

/** SCImago Journal Rank, one row per ISSN per yearly edition. */
export const journalMetrics = pgTable('journal_metrics', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  issn: text('issn').notNull(),              // 8 characters, no hyphen, upper-case X
  year: integer('year').notNull(),           // the SJR edition year
  title: text('title').notNull(),
  sourceType: text('source_type').notNull(), // journal | book series | conference and proceedings | trade journal
  quartile: text('quartile'),                // Q1..Q4, or null when unranked
  /** 'scimago' = SCImago's own file (official quartile); 'scopus-list' = computed from Elsevier's list. */
  source: text('source').notNull().default('scimago'),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('journal_metrics_issn_year_uq').on(t.issn, t.year)]);

/** Journals listed in an index (SCIE, SSCI, AHCI, ESCI, Scopus …), one row per ISSN per list per year. */
export const journalIndexListings = pgTable('journal_index_listings', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  issn: text('issn').notNull(),
  listName: text('list_name').notNull(),     // must equal a value of the indexingTypes master list
  year: integer('year').notNull(),           // the year the list was downloaded
  title: text('title').notNull().default(''),
  /** 'upload' = loaded by IQAC; 'scopus-list' = fetched automatically from Elsevier's public list. */
  source: text('source').notNull().default('upload'),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('journal_index_issn_list_year_uq').on(t.issn, t.listName, t.year)]);

/* ───────────────────────────── relations ───────────────────────── */

export const usersRelations = relations(users, ({ one, many }) => ({
  department: one(departments, { fields: [users.departmentId], references: [departments.id] }),
  records: many(records),
}));

export const recordsRelations = relations(records, ({ one, many }) => ({
  owner: one(users, { fields: [records.ownerUserId], references: [users.id] }),
  department: one(departments, { fields: [records.departmentId], references: [departments.id] }),
  cycle: one(cycles, { fields: [records.cycleId], references: [cycles.id] }),
  evidence: many(evidenceFiles),
  transitions: many(recordTransitions),
}));

export const evidenceRelations = relations(evidenceFiles, ({ one }) => ({
  record: one(records, { fields: [evidenceFiles.recordId], references: [records.id] }),
}));
