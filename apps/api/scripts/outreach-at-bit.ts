/**
 * Outreach Activities now means service outside BIT, and the "Where" question is gone. This lists the
 * records that were entered as "At BIT" (or whose organisation is BIT Mesra), so IQAC can decide what to do
 * with them. It only lists: nothing is deleted or changed. They are still counted in Outreach until their
 * owner or IQAC removes them, and an owner who edits one is asked for an institute outside BIT.
 *
 *   npm run db:outreach-at-bit -w @darp/api
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { records, users } from '../src/server/db/schema';
import { normInstitution } from '@darp/shared/institutions';

const rows = await db.select({ id: records.id, data: records.data, status: records.status, owner: users.name }).from(records)
  .innerJoin(users, eq(users.id, records.ownerUserId))
  .where(and(eq(records.moduleKey, 'outreach'), isNull(records.deletedAt)));

const isBit = (text: unknown) => {
  const n = normInstitution(String(text ?? ''));
  return /\bmesra\b/.test(n) && /\b(bit|birla)\b/.test(n);
};
const found = rows.filter((r) => {
  const d = r.data as Record<string, unknown>;
  return d.where === 'At BIT' || d.organisationCode === 'U-0202' || isBit(d.organisation);
});

console.log(`${rows.length} Outreach record(s); ${found.length} at BIT:`);
console.table(found.map((r) => {
  const d = r.data as Record<string, unknown>;
  return { owner: r.owner, status: r.status, type: d.activityType, event: d.eventName ?? d.journalName ?? d.bodyName ?? '', year: d.year, organisation: d.organisation };
}));
console.log('Nothing was changed. Ask each owner to remove or correct these, or tell me what to do with them.');
await pool.end();
