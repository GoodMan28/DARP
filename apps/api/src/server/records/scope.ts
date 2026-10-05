import { and, eq, isNull, SQL } from 'drizzle-orm';
import { records } from '@/server/db/schema';
import type { ModuleConfig } from '@darp/shared/modules/types';
import type { SessionUser } from '@/server/auth/session';

/** A uuid that cannot exist, used to express "match nothing" without a special case. */
const MATCHES_NOTHING = '00000000-0000-0000-0000-000000000000';

/**
 * Returns the WHERE clause every record query MUST use. Deny-by-default:
 * if a role has no rule here, it sees nothing.
 *
 * Never build a record query without calling this. There is a test
 * (tests/security/no-unscoped-queries.test.ts) that greps the codebase for violations.
 */
export function scopeFilter(actor: SessionUser, m: ModuleConfig, cycleId: string): SQL {
  const base = and(
    eq(records.moduleKey, m.key),
    eq(records.cycleId, cycleId),
    isNull(records.deletedAt),
  )!;

  if (actor.role === 'admin') return base;

  // The owning office sees every record of the modules it owns or verifies.
  if (m.verifierRoles.includes(actor.role) || m.viewRoles.includes(actor.role)) return base;

  if (actor.role === 'hod') {
    if (!actor.departmentId) return and(base, eq(records.id, MATCHES_NOTHING))!;
    return and(base, eq(records.departmentId, actor.departmentId))!;
  }

  if (actor.role === 'faculty') return and(base, eq(records.ownerUserId, actor.id))!;

  // Unknown combination: see nothing.
  return and(base, eq(records.id, MATCHES_NOTHING))!;
}
