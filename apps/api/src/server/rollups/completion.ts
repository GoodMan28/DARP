import { and, count, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/server/db';
import { records, profileBaselines, moduleDeclarations, users, departments } from '@/server/db/schema';
import { getModule, modulesOwnedBy, modulesVerifiedBy } from '@darp/shared/modules';
import type { PeriodType, RecordStatus, Role } from '@darp/shared/modules/types';
import type { SessionUser } from '@/server/auth/session';
import { scopeFilter } from '@/server/records/scope';
import { activeCycle, mustGetModule, ServiceError } from '@/server/records/service';
import { yearOfPeriod, type CycleWindows } from '@/server/records/periods';
import {
  COUNTERS, DECLARED_COUNTERS, COUNTER_MODULE_KEYS, COUNTED_STATUSES,
  computeCounters,
  type CountableRecord, type CycleBounds,
} from './counters';
import type {
  ComputedCounter, DeclaredCounter, CounterValues,
  ModuleProgress, ModuleStatusRow, DepartmentCompletionRow, VerificationQueueRow,
} from '@darp/shared/contracts';

// The result shapes live in the shared API contract; re-exported so callers keep one import.
export type {
  ComputedCounter, DeclaredCounter, CounterValues,
  ModuleProgress, ModuleStatusRow, DepartmentCompletionRow, VerificationQueueRow,
};

/* ═════════════════════════ shared scope helper ═════════════════════════ */

/** A uuid that cannot exist, used to express "match nothing" without a special case. */
const MATCHES_NOTHING = '00000000-0000-0000-0000-000000000000';

/**
 * The scope clause for several modules at once: the union of each module's own
 * `scopeFilter()`. It never widens what that function allows for a single module,
 * and an unreadable set of modules matches nothing rather than everything.
 */
export function scopedModulesFilter(actor: SessionUser, moduleKeys: string[], cycleId: string): SQL {
  const parts: SQL[] = [];
  for (const key of moduleKeys) {
    const m = getModule(key);
    if (m) parts.push(scopeFilter(actor, m, cycleId));
  }
  if (parts.length === 0) return eq(records.id, MATCHES_NOTHING);
  return or(...parts)!;
}

/* ═══════════════════════ profile counter roll-ups ══════════════════════ */

export function boundsOf(cycle: CycleWindows): CycleBounds {
  return {
    CY: [yearOfPeriod(new Date(cycle.cyStart), 'CY'), yearOfPeriod(new Date(cycle.cyEnd), 'CY')],
    FY: [yearOfPeriod(new Date(cycle.fyStart), 'FY'), yearOfPeriod(new Date(cycle.fyEnd), 'FY')],
    AY: [yearOfPeriod(new Date(cycle.ayStart), 'AY'), yearOfPeriod(new Date(cycle.ayEnd), 'AY')],
  };
}

const periodTypeOf = (moduleKey: string): PeriodType => mustGetModule(moduleKey).periodType;

/**
 * All counters for one user: computed, declared, and where each number came from.
 * Faculty may read their own; only admin may read anyone else's.
 */
export async function counterValuesFor(actor: SessionUser, userId: string): Promise<CounterValues> {
  if (userId !== actor.id && actor.role !== 'admin') {
    throw new ServiceError('FORBIDDEN', 'You may only view your own profile counters.');
  }

  const cycle = await activeCycle();
  const bounds = boundsOf(cycle);

  const rows = await db
    .select({
      moduleKey: records.moduleKey,
      periodYear: records.periodYear,
      status: records.status,
      data: records.data,
    })
    .from(records)
    .where(and(
      scopedModulesFilter(actor, COUNTER_MODULE_KEYS, cycle.id),
      eq(records.ownerUserId, userId),
      inArray(records.status, COUNTED_STATUSES),
    ));

  const baselineRows = await db
    .select({ counterKey: profileBaselines.counterKey, value: profileBaselines.value })
    .from(profileBaselines)
    .where(eq(profileBaselines.userId, userId));

  const baselines: Record<string, number> = {};
  for (const b of baselineRows) baselines[b.counterKey] = Number(b.value);

  const countable: CountableRecord[] = rows.map((r) => ({
    moduleKey: r.moduleKey,
    periodYear: r.periodYear,
    status: r.status,
    data: (r.data ?? {}) as Record<string, unknown>,
  }));

  const computed = computeCounters(countable, bounds, periodTypeOf, baselines);

  return {
    userId,
    computed: COUNTERS.map((c) => ({
      key: c.key,
      label: c.label,
      value: computed[c.key] ?? 0,
      format: c.format,
      window: c.window,
      moduleKey: c.moduleKey,
      moduleName: mustGetModule(c.moduleKey).name,
      baseline: c.window === 'sinceJoining' ? (baselines[c.key] ?? 0) : 0,
    })),
    declared: DECLARED_COUNTERS.map((c) => ({ ...c, value: baselines[c.key] ?? 0 })),
  };
}

/** Which counter keys accept a manually-entered figure. */
const BASELINE_KEYS = new Set<string>([
  ...COUNTERS.filter((c) => c.window === 'sinceJoining').map((c) => c.key),
  ...DECLARED_COUNTERS.map((c) => c.key),
]);

/**
 * Faculty may set their own figure, admin may set anyone's. The caller audits it.
 * A `cycle` counter has no baseline — it is computed from records, so seeding it
 * would silently inflate an accreditation figure.
 */
export async function setBaseline(
  actor: SessionUser, userId: string, counterKey: string, value: number,
): Promise<{ userId: string; counterKey: string; value: number }> {
  if (userId !== actor.id && actor.role !== 'admin') {
    throw new ServiceError('FORBIDDEN', 'You may only edit your own figures.');
  }
  if (!BASELINE_KEYS.has(counterKey)) {
    throw new ServiceError('VALIDATION', 'That figure is not one you can enter by hand.', {
      counterKey: 'Unknown counter.',
    });
  }
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000_000_000) {
    throw new ServiceError('VALIDATION', 'Enter a whole number of zero or more.', {
      value: 'Enter a whole number.',
    });
  }

  await db.insert(profileBaselines)
    .values({ userId, counterKey, value, setBy: actor.id })
    .onConflictDoUpdate({
      target: [profileBaselines.userId, profileBaselines.counterKey],
      set: { value, setBy: actor.id, updatedAt: new Date() },
    });

  return { userId, counterKey, value };
}

/* ═══════════════════════ module completion tracking ════════════════════ */

type ProgressInput = Pick<
  ModuleStatusRow, 'total' | 'drafts' | 'submitted' | 'verified' | 'approved' | 'declaredNil'
>;

function progressOf(row: ProgressInput): ModuleProgress {
  if (row.declaredNil && row.total === 0) return 'submitted';   // a nil return is a complete answer
  if (row.total === 0) return 'not_started';
  if (row.approved === row.total) return 'approved';
  if (row.approved + row.verified === row.total) return 'verified';
  if (row.drafts === 0) return 'submitted';
  return 'in_progress';
}

/**
 * Per-module status for one person, over the modules their role must fill in.
 * Only admin may ask about somebody else.
 */
export async function moduleStatusForUser(
  actor: SessionUser, userId: string, role: Role,
): Promise<ModuleStatusRow[]> {
  if (userId !== actor.id && actor.role !== 'admin') {
    throw new ServiceError('FORBIDDEN', 'You may only view your own progress.');
  }

  const cycle = await activeCycle();
  const owned = modulesOwnedBy(role);
  if (owned.length === 0) return [];
  const keys = owned.map((m) => m.key);

  const counts = await db
    .select({ moduleKey: records.moduleKey, status: records.status, n: count() })
    .from(records)
    .where(and(
      scopedModulesFilter(actor, keys, cycle.id),
      eq(records.ownerUserId, userId),
    ))
    .groupBy(records.moduleKey, records.status);

  const decls = await db
    .select({ moduleKey: moduleDeclarations.moduleKey, declaredNil: moduleDeclarations.declaredNil })
    .from(moduleDeclarations)
    .where(and(
      eq(moduleDeclarations.userId, userId),
      eq(moduleDeclarations.cycleId, cycle.id),
      inArray(moduleDeclarations.moduleKey, keys),
    ));
  const nilSet = new Set(decls.filter((d) => d.declaredNil).map((d) => d.moduleKey));

  return owned.map((m) => {
    const mine = counts.filter((c) => c.moduleKey === m.key);
    const pick = (s: RecordStatus): number => Number(mine.find((c) => c.status === s)?.n ?? 0);
    const base: ProgressInput = {
      total: mine.reduce((a, c) => a + Number(c.n), 0),
      drafts: pick('draft') + pick('returned'),
      submitted: pick('submitted'),
      verified: pick('verified'),
      approved: pick('approved'),
      declaredNil: nilSet.has(m.key),
    };
    return {
      key: m.key,
      name: m.name,
      group: m.group,
      periodType: m.periodType,
      ...base,
      progress: progressOf(base),
    };
  });
}

/**
 * The completion table on the HOD, dean and IQAC dashboards. Aggregates only —
 * it never returns a record's contents. A HOD's scope limits it to their department.
 */
export async function departmentCompletion(actor: SessionUser): Promise<DepartmentCompletionRow[]> {
  if (actor.role === 'faculty') {
    throw new ServiceError('FORBIDDEN', 'Department completion is for heads and offices.');
  }

  const cycle = await activeCycle();
  const facultyModuleKeys = modulesOwnedBy('faculty').map((m) => m.key);
  const modulesApplicable = facultyModuleKeys.length;

  const depts = await db
    .select({ id: departments.id, code: departments.code, name: departments.name })
    .from(departments)
    .where(eq(departments.isActive, true));

  const facultyCounts = await db
    .select({ departmentId: users.departmentId, n: count() })
    .from(users)
    .where(and(eq(users.role, 'faculty'), eq(users.isActive, true)))
    .groupBy(users.departmentId);

  const recordCounts = await db
    .select({
      departmentId: records.departmentId,
      n: count(),
      reporters: sql<number>`count(distinct ${records.ownerUserId})`,
      completeModules: sql<number>`count(distinct ${records.moduleKey}) filter (
        where ${records.status} in ('submitted','verified','approved'))`,
    })
    .from(records)
    .where(and(
      scopedModulesFilter(actor, facultyModuleKeys, cycle.id),
      isNull(records.deletedAt),
    ))
    .groupBy(records.departmentId);

  const visible = actor.role === 'hod' && actor.departmentId
    ? depts.filter((d) => d.id === actor.departmentId)
    : depts;

  return visible
    .map((d) => {
      const rec = recordCounts.find((r) => r.departmentId === d.id);
      const modulesComplete = Number(rec?.completeModules ?? 0);
      const pct = modulesApplicable === 0
        ? 0
        : Math.min(100, Math.round((modulesComplete / modulesApplicable) * 100));
      return {
        departmentId: d.id,
        departmentCode: d.code,
        department: d.name,
        facultyTotal: Number(facultyCounts.find((f) => f.departmentId === d.id)?.n ?? 0),
        facultyReporting: Number(rec?.reporters ?? 0),
        records: Number(rec?.n ?? 0),
        modulesComplete,
        modulesApplicable,
        pct,
      };
    })
    .sort((a, b) => b.pct - a.pct || a.department.localeCompare(b.department));
}

/**
 * What the caller's office still has to act on, for the dashboard's queue panel.
 * The queue is what a role verifies, not what it owns.
 */
export async function verificationQueue(actor: SessionUser): Promise<VerificationQueueRow[]> {
  const cycle = await activeCycle();
  const mods = modulesVerifiedBy(actor.role);
  if (mods.length === 0) return [];
  const keys = mods.map((m) => m.key);

  const rows = await db
    .select({ moduleKey: records.moduleKey, status: records.status, n: count() })
    .from(records)
    .where(and(
      scopedModulesFilter(actor, keys, cycle.id),
      inArray(records.status, ['submitted', 'verified'] as RecordStatus[]),
    ))
    .groupBy(records.moduleKey, records.status);

  return mods
    .map((m) => {
      const mine = rows.filter((r) => r.moduleKey === m.key);
      const pick = (s: RecordStatus): number => Number(mine.find((r) => r.status === s)?.n ?? 0);
      return {
        moduleKey: m.key,
        name: m.name,
        awaitingVerification: pick('submitted'),
        awaitingApproval: actor.role === 'admin' ? pick('verified') : 0,
      };
    })
    .filter((r) => r.awaitingVerification > 0 || r.awaitingApproval > 0);
}
