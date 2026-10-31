/**
 * One-off (October 2026): turns the saved YEAR of grants, awards, R&I awards, extension awards,
 * fellowships, MoUs and financial support into a DATE, and the free-text duration of grants and MoUs
 * into a number of years.
 *
 *   npm run db:year-to-date -w @darp/api              (the database in .env.local)
 *   npm run db:year-to-date -w @darp/api -- --dry-run  (counts only, changes nothing)
 *
 * Run it on the test database first (set DATABASE_URL and DATABASE_URL_OWNER to .../darp_test).
 *
 * Each year becomes the first day of the record's own reporting period, so no record moves to another
 * year: CY 2024 → 2024-01-01, FY 2024-25 → 2024-04-01, AY 2024-25 → 2024-07-01. The record is marked
 * "estimated" until its owner enters the exact date, and the change is written to its edit history.
 * A duration that cannot be read as a number is left empty and marked "needs input".
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { records, recordEdits } from '../src/server/db/schema';
import { MODULES } from '@darp/shared/modules';
import { prepareForStorage } from '../src/server/records/prepare';
import { parseYears } from '../src/server/records/duration';

const DATE_FIELDS: Record<string, { from: string; to: string; start: (y: number) => string }> = {
  grants: { from: 'sanctionYear', to: 'sanctionDate', start: (y) => `${y}-04-01` },
  fellowships: { from: 'awardYear', to: 'awardDate', start: (y) => `${y}-04-01` },
  finsupport: { from: 'supportYear', to: 'supportDate', start: (y) => `${y}-04-01` },
  awards: { from: 'awardYear', to: 'awardDate', start: (y) => `${y}-01-01` },
  riawards: { from: 'awardYear', to: 'awardDate', start: (y) => `${y}-01-01` },
  extawards: { from: 'awardYear', to: 'awardDate', start: (y) => `${y}-01-01` },
  mous: { from: 'signingYear', to: 'signingDate', start: (y) => `${y}-07-01` },
};
const DURATION_MODULES = new Set(['grants', 'mous']);

async function main() {
  const dry = process.argv.includes('--dry-run');
  const counts: Record<string, { dates: number; durations: number; needsInput: number }> = {};

  await db.transaction(async (tx) => {
    for (const moduleKey of Object.keys(DATE_FIELDS)) {
      const spec = DATE_FIELDS[moduleKey]!;
      const rows = await tx.select().from(records).where(and(eq(records.moduleKey, moduleKey), isNull(records.deletedAt)));
      for (const r of rows) {
        const data = { ...(r.data as Record<string, unknown>) };
        const notes = { estimated: [...(r.dataNotes?.estimated ?? [])], needsInput: [...(r.dataNotes?.needsInput ?? [])] };
        const changes: Array<{ key: string; label: string; from: string; to: string }> = [];
        const c = (counts[moduleKey] ??= { dates: 0, durations: 0, needsInput: 0 });

        if (data[spec.from] !== undefined) {
          const year = Number(String(data[spec.from]));
          if (Number.isInteger(year) && year >= 1950 && year <= 2100) {
            data[spec.to] = spec.start(year);
            notes.estimated.push(spec.to);
            changes.push({ key: spec.to, label: 'Date', from: String(year), to: `${spec.start(year)} (estimated from the year)` });
            c.dates += 1;
          }
          delete data[spec.from];
        }
        if (DURATION_MODULES.has(moduleKey) && data.duration !== undefined) {
          const years = parseYears(data.duration);
          if (years !== null) {
            data.durationYears = String(years);
            changes.push({ key: 'durationYears', label: 'Duration (in years)', from: String(data.duration), to: String(years) });
            c.durations += 1;
          } else {
            notes.needsInput.push('durationYears');
            c.needsInput += 1;
          }
          delete data.duration;
        }
        if (changes.length === 0 && !notes.needsInput.length) continue;

        if (!dry) {
          // The duplicate check now compares the date, so the key is rebuilt from the new values.
          const naturalKey = prepareForStorage(MODULES[moduleKey]!, data, r.departmentId).naturalKey;
          await tx.update(records).set({ data, dataNotes: notes, naturalKey }).where(eq(records.id, r.id));
          if (changes.length > 0) {
            await tx.insert(recordEdits).values({ recordId: r.id, userId: null, changes, note: 'Date estimated from the year (October 2026 change)' });
          }
        }
      }
    }
    if (dry) throw new Error('dry-run');
  }).catch((e) => { if (!(e instanceof Error && e.message === 'dry-run')) throw e; });

  console.error(dry ? 'Dry run: nothing was changed.' : 'Done.');
  for (const [k, v] of Object.entries(counts)) {
    console.error(`${k}: ${v.dates} dates estimated, ${v.durations} durations read, ${v.needsInput} durations need entering`);
  }
  await pool.end();
}

if (process.argv[1]?.includes('year-to-date')) {
  main().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await pool.end(); process.exit(1); });
}
