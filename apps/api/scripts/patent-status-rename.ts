/**
 * One-off (Phase 4): the patent status list becomes Applied, Published, Granted.
 *   - the list item "Awarded/Granted" is renamed "Granted", and "Applied" is added first;
 *   - every saved patent with status "Awarded/Granted" becomes "Granted".
 *
 *   npm run db:patent-status -w @darp/api               (the database in .env.local)
 *   npm run db:patent-status -w @darp/api -- --dry-run   (counts only)
 *
 * Run it on the test database first (set DATABASE_URL and DATABASE_URL_OWNER to .../darp_test).
 */
import { and, eq, sql } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { masterListItems, records } from '../src/server/db/schema';

async function main() {
  const dry = process.argv.includes('--dry-run');
  let recordsChanged = 0;
  await db.transaction(async (tx) => {
    const key = 'patentStatus';
    const old = await tx.select().from(masterListItems).where(and(eq(masterListItems.listKey, key), eq(masterListItems.value, 'Awarded/Granted')));
    const granted = await tx.select().from(masterListItems).where(and(eq(masterListItems.listKey, key), eq(masterListItems.value, 'Granted')));
    if (old.length && !granted.length) {
      await tx.update(masterListItems).set({ value: 'Granted', sortOrder: 2 }).where(eq(masterListItems.id, old[0]!.id));
    } else if (old.length) {
      await tx.delete(masterListItems).where(eq(masterListItems.id, old[0]!.id));
    }
    await tx.insert(masterListItems).values([
      { listKey: key, value: 'Applied', sortOrder: 0 },
      { listKey: key, value: 'Published', sortOrder: 1 },
      { listKey: key, value: 'Granted', sortOrder: 2 },
    ]).onConflictDoUpdate({ target: [masterListItems.listKey, masterListItems.parent, masterListItems.value], set: { sortOrder: sql`excluded.sort_order`, isActive: true } });

    const moved = await tx.update(records)
      .set({ data: sql`jsonb_set(${records.data}, '{status}', '"Granted"')` })
      .where(and(eq(records.moduleKey, 'patents'), sql`${records.data} ->> 'status' = 'Awarded/Granted'`))
      .returning({ id: records.id });
    recordsChanged = moved.length;
    if (dry) throw new Error('dry-run');
  }).catch((e) => { if (!(e instanceof Error && e.message === 'dry-run')) throw e; });

  console.error(dry ? 'Dry run: nothing was changed.' : 'Done.');
  console.error(`${recordsChanged} patent record${recordsChanged === 1 ? '' : 's'} ${dry ? 'would change' : 'changed'} from "Awarded/Granted" to "Granted".`);
  await pool.end();
}

main().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await pool.end(); process.exit(1); });
