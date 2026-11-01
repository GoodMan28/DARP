/**
 * One-off (November 2026): every faculty module now asks whether the work was done while the person was at
 * BIT. A record saved before has no answer. This works the answer out from the owner's joining date and the
 * record's date (for papers and books, the year when the exact date was never fetched), the same way the
 * form does; with --apply it writes only that one key, only where it is blank.
 *
 *   npm run db:affiliation-backfill -w @darp/api             lists what would change; changes nothing
 *   npm run db:affiliation-backfill -w @darp/api -- --apply  writes it
 *
 * A record dated in the very year of joining (the day is unknown) is left blank: its owner is asked when
 * they next edit it. Nothing already answered is touched, and no status changes. Blank counts as at BIT in
 * reports, so nothing disappears while this has not been run.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { records, users, auditLog } from '../src/server/db/schema';
import { MODULES } from '@darp/shared/modules';
import { affiliationFrom, firstDate } from '@darp/shared/affiliation';

const apply = process.argv.includes('--apply');
const report: Array<{ module: string; yes: number; no: number; blank: number; noJoiningDate: number }> = [];
const writes: Array<{ id: string; field: string; answer: 'Yes' | 'No' }> = [];

for (const m of Object.values(MODULES)) {
  if (!m.affiliation) continue;
  const field = m.affiliation.field;
  const rows = await db.select({ id: records.id, data: records.data, joined: users.dateOfJoining })
    .from(records).innerJoin(users, eq(users.id, records.ownerUserId))
    .where(and(eq(records.moduleKey, m.key), isNull(records.deletedAt), sql`coalesce(${records.data} ->> ${field}, '') = ''`));
  const line = { module: m.key, yes: 0, no: 0, blank: 0, noJoiningDate: 0 };
  for (const r of rows) {
    const data = r.data as Record<string, unknown>;
    // A paper or book fetched before the exact date was kept has only its year.
    const when = firstDate(m, data) || (typeof data.year === 'string' || typeof data.year === 'number' ? String(data.year) : '');
    const joining = r.joined ? String(r.joined).slice(0, 10) : null;
    const answer = affiliationFrom(joining, when);
    if (!joining) line.noJoiningDate += 1;
    if (!answer) { line.blank += 1; continue; }
    if (answer === 'Yes') line.yes += 1; else line.no += 1;
    writes.push({ id: r.id, field, answer });
  }
  report.push(line);
}
console.table(report);

if (apply && writes.length > 0) {
  await db.transaction(async (tx) => {
    for (const w of writes) {
      await tx.update(records).set({ data: sql`${records.data} || ${JSON.stringify({ [w.field]: w.answer })}::jsonb` }).where(eq(records.id, w.id));
    }
    await tx.insert(auditLog).values({
      actorUserId: null, actorRole: null, action: 'record.update', entity: 'record', entityId: null,
      meta: { change: 'affiliation backfill', yes: writes.filter((w) => w.answer === 'Yes').length, no: writes.filter((w) => w.answer === 'No').length },
    });
  });
}
const yes = writes.filter((w) => w.answer === 'Yes').length;
console.log(apply
  ? `Done: ${writes.length} record(s) answered (${yes} Yes, ${writes.length - yes} No).`
  : `${writes.length} record(s) would be answered (${yes} Yes, ${writes.length - yes} No). Run again with --apply to write them.`);
await pool.end();
