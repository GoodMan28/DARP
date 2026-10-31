/**
 * One-off (October 2026): accounts made before names had parts keep the whole name in "first name"
 * ("Dr Vandana Bhattacharjee"). This splits each into prefix, first, middle and last, the way the
 * Account page and the author matching already read them. The display name is not changed.
 *
 *   npm run db:split-names -w @darp/api             lists what would change; changes nothing
 *   npm run db:split-names -w @darp/api -- --apply  writes it
 */
import { and, eq, sql } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { users } from '../src/server/db/schema';
import { splitName } from '@darp/shared/names';

const apply = process.argv.includes('--apply');

const rows = await db.select({
  id: users.id, name: users.name, prefix: users.namePrefix, first: users.firstName, middle: users.middleName, last: users.lastName,
}).from(users).where(and(eq(users.lastName, ''), eq(users.middleName, ''), sql`${users.firstName} ~ '[[:space:]]'`));

let changed = 0;
for (const r of rows) {
  const p = splitName(r.first);
  const next = { prefix: r.prefix || p.prefix, first: p.first, middle: p.middle, last: p.last };
  if (!next.last) continue;                       // a single word: nothing to split
  console.log(`${r.name}: "${r.first}" -> prefix "${next.prefix}", first "${next.first}", middle "${next.middle}", last "${next.last}"`);
  changed += 1;
  if (apply) {
    await db.update(users).set({ namePrefix: next.prefix, firstName: next.first, middleName: next.middle, lastName: next.last, updatedAt: new Date() })
      .where(eq(users.id, r.id));
  }
}
console.log(apply ? `Updated ${changed} account(s).` : `${changed} account(s) would change. Run again with --apply to write them.`);
await pool.end();
