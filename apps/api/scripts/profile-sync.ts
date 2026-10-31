/**
 * One-off (November 2026): the Faculty Profile now takes the account's name and joining date instead of
 * its own copies. This lists each profile whose copy differs from the account, and the profiles still in
 * draft; with --apply it writes the account's name and joining date into them.
 *
 *   npm run db:profile-sync -w @darp/api             lists what would change; changes nothing
 *   npm run db:profile-sync -w @darp/api -- --apply  writes it
 *
 * It does not approve drafts: the person's next save does that. An account with no joining date is listed
 * so IQAC can set it (the profile's own date is then cleared).
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { records, users } from '../src/server/db/schema';

const apply = process.argv.includes('--apply');

const rows = await db.select({
  id: records.id, status: records.status, data: records.data,
  userId: users.id, name: users.name, dateOfJoining: users.dateOfJoining,
}).from(records).innerJoin(users, eq(users.id, records.ownerUserId))
  .where(and(eq(records.moduleKey, 'profile'), isNull(records.deletedAt)));

let changed = 0;
for (const r of rows) {
  const d = (r.data ?? {}) as Record<string, unknown>;
  const joining = r.dateOfJoining ? String(r.dateOfJoining).slice(0, 10) : '';
  const same = d.name === r.name && String(d.joiningDate ?? '') === joining;
  if (!same) {
    changed += 1;
    console.log(`${r.name}: name "${String(d.name ?? '')}" -> "${r.name}", joined "${String(d.joiningDate ?? '')}" -> "${joining || '(not set)'}"${r.status !== 'approved' ? `  [${r.status}]` : ''}`);
    if (apply) {
      await db.update(records).set({ data: { ...d, name: r.name, joiningDate: joining } }).where(eq(records.id, r.id));
    }
  } else if (r.status !== 'approved') {
    console.log(`${r.name}: unchanged, but the profile is a ${r.status}: it is approved when ${r.name} next saves it`);
  }
  if (!joining) console.log(`  ${r.name} has no date of joining on the account: IQAC should set it`);
}
console.log(apply ? `Updated ${changed} profile(s).` : `${changed} profile(s) would change. Run again with --apply to write them.`);
await pool.end();
