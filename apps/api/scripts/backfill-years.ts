/**
 * One-off (Phase 2): gives every record its year in all three year types (calendar, financial,
 * academic) and re-dates it from the field its module names as the date source. This also fixes
 * patents, which used to be dated by the filing date and are now dated by the publish/grant date.
 *
 *   npm run db:backfill-years -w @darp/api               (the database in .env.local)
 *   npm run db:backfill-years -w @darp/api -- --dry-run   (counts only)
 *
 * Run it on the test database first (set DATABASE_URL and DATABASE_URL_OWNER to .../darp_test).
 * A full date fills all three years; a year alone fills only the module's own type. Records with no
 * usable date or year, and the undated Faculty Profile, are left alone.
 */
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { records } from '../src/server/db/schema';
import { MODULE_LIST } from '@darp/shared/modules';
import { resolvePeriod, periodSourceField } from '../src/server/records/periods';
import { defaultRange, windowsOfRange } from '../src/server/records/range';

async function main() {
  const dry = process.argv.includes('--dry-run');
  const range = await defaultRange();
  const cycle = windowsOfRange(range, range.id);
  const counts: Record<string, { checked: number; changed: number; redated: number }> = {};

  await db.transaction(async (tx) => {
    for (const m of MODULE_LIST) {
      if (m.periodic === false) continue;
      const src = periodSourceField(m);
      if (!src) continue;
      const rows = await tx.select().from(records).where(eq(records.moduleKey, m.key));
      const c = (counts[m.key] ??= { checked: 0, changed: 0, redated: 0 });
      for (const r of rows) {
        const data = r.data as Record<string, unknown>;
        if (data[src.key] === undefined || data[src.key] === '') continue;      // nothing to date it by
        c.checked += 1;
        const p = resolvePeriod(m, data, cycle);
        const same = r.periodYear === p.periodYear && r.cyYear === p.cyYear && r.fyYear === p.fyYear && r.ayYear === p.ayYear;
        if (same) continue;
        c.changed += 1;
        if (r.periodYear !== p.periodYear) c.redated += 1;
        if (!dry) {
          await tx.update(records).set({
            periodYear: p.periodYear, periodLabel: p.periodLabel, cyYear: p.cyYear, fyYear: p.fyYear, ayYear: p.ayYear,
          }).where(eq(records.id, r.id));
        }
      }
    }
    if (dry) throw new Error('dry-run');
  }).catch((e) => { if (!(e instanceof Error && e.message === 'dry-run')) throw e; });

  console.error(dry ? 'Dry run: nothing was changed.' : 'Done.');
  for (const [k, v] of Object.entries(counts)) {
    if (v.checked) console.error(`${k}: ${v.checked} checked, ${v.changed} updated${v.redated ? `, ${v.redated} moved to a different year` : ''}`);
  }
  await pool.end();
}

main().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await pool.end(); process.exit(1); });
