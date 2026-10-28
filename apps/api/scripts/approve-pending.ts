/**
 * One-off: every record still waiting for a check ('submitted' or 'verified') becomes 'approved',
 * because records are now approved on submission. Prints the count per module.
 *
 *   npm run db:approve-pending -w @darp/api            (the database in .env.local)
 *
 * Run it on the test database first (set DATABASE_URL and DATABASE_URL_OWNER to .../darp_test).
 */
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { records, recordTransitions } from '../src/server/db/schema';
import { systemActor } from '../src/server/lookup/system';

async function main() {
  const system = await systemActor();
  const waiting = await db.select({ moduleKey: records.moduleKey, n: count() }).from(records)
    .where(and(inArray(records.status, ['submitted', 'verified']), isNull(records.deletedAt)))
    .groupBy(records.moduleKey);
  if (waiting.length === 0) { console.error('Nothing is waiting for a check.'); await pool.end(); return; }

  const now = new Date();
  await db.transaction(async (tx) => {
    const rows = await tx.select({ id: records.id, status: records.status, verifiedAt: records.verifiedAt, verifiedBy: records.verifiedBy })
      .from(records).where(and(inArray(records.status, ['submitted', 'verified']), isNull(records.deletedAt)));
    for (const r of rows) {
      await tx.update(records).set({
        status: 'approved', approvedAt: now, approvedBy: system.id,
        verifiedAt: r.verifiedAt ?? now, verifiedBy: r.verifiedBy ?? system.id,
      }).where(eq(records.id, r.id));
      await tx.insert(recordTransitions).values({
        recordId: r.id, fromStatus: r.status, toStatus: 'approved',
        actorUserId: system.id, actorRole: system.role,
        remark: 'Approved: the approval step was removed (October 2026).',
      });
    }
  });
  for (const w of waiting) console.error(`${w.moduleKey}: ${w.n} approved`);
  await pool.end();
}

main().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await pool.end(); process.exit(1); });
