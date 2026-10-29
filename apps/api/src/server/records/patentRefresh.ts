import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { records, recordEdits } from '@/server/db/schema';
import { getModule } from '@darp/shared/modules';
import type { FieldProvenance, RecordVerification, AutoUpdateRow } from '@darp/shared/contracts';
import { log } from '@/server/log';
import { resolvePeriod } from './periods';
import { defaultRange, windowsOfRange } from './range';
import { scopeFilter } from './scope';
import { systemActor } from '@/server/lookup/system';
import type { SessionUser } from '@/server/auth/session';
import { resolvePatent, PATENT_STAGE } from '@/server/lookup/patent';
import { patentStatusDate } from '@/server/lookup/apply';

const text = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** The fields a later journal issue may fill in, and what each is called in the edit history. */
const MOVES: Array<{ key: string; meta: 'patentStatus' | 'publishedDate' | 'grantDate' | 'patentNo' | 'filedDate' | 'title'; label: string }> = [
  { key: 'status', meta: 'patentStatus', label: 'Status of Patent' },
  { key: 'publishedDate', meta: 'publishedDate', label: 'Date published (Patent Office Journal)' },
  { key: 'grantDate', meta: 'grantDate', label: 'Date granted (as published in the Journal)' },
  { key: 'patentNumber', meta: 'patentNo', label: 'Patent (grant) number' },
  { key: 'filedDate', meta: 'filedDate', label: 'Date filed (Applied)' },
  { key: 'title', meta: 'title', label: 'Title of the patent' },
];

/**
 * Moves saved patents forward (Applied → Published → Granted) when the Journal index has caught up.
 * A record never moves backwards, a field the owner changed on purpose is never overwritten, and an
 * approved record stays approved. Every move is written to the record's edit history with no user.
 */
export async function refreshPatentRecords(): Promise<{ checked: number; moved: number }> {
  const m = getModule('patents');
  if (!m) return { checked: 0, moved: 0 };
  const range = await defaultRange();
  const cycle = windowsOfRange(range, range.id);

  // A system job, not a person's request: it runs as the system account, which sees every record.
  const rows = await db.select().from(records).where(and(
    scopeFilter(await systemActor(), m),
    sql`coalesce(${records.data} ->> 'status', '') <> 'Granted'`,
    sql`coalesce(${records.data} ->> 'applicationNo', '') <> ''`,
  ));

  let moved = 0;
  for (const r of rows) {
    const data = { ...(r.data as Record<string, unknown>) };
    const verification = (r.verification as RecordVerification | null) ?? null;
    const provenance: Record<string, FieldProvenance> = { ...(verification?.fields ?? {}) };

    const found = await resolvePatent(text(data.applicationNo));
    if (!found.found) continue;
    const fetchedStage = PATENT_STAGE[found.values.patentStatus ?? ''];
    const savedStage = PATENT_STAGE[text(data.status)] ?? -1;
    // Only forward; and if the owner chose the status on purpose, leave it to them.
    if (fetchedStage === undefined || fetchedStage <= savedStage) continue;
    if (provenance.status?.origin === 'changed') continue;

    const changes: Array<{ key: string; label: string; from: string; to: string }> = [];
    for (const f of MOVES) {
      const fetched = text(found.values[f.meta]);
      if (!fetched) continue;
      if (provenance[f.key]?.origin === 'changed') continue;
      // A title or filing date the owner already has stays; the journal only fills what is empty.
      if ((f.key === 'title' || f.key === 'filedDate') && text(data[f.key])) continue;
      if (text(data[f.key]) === fetched) continue;
      changes.push({ key: f.key, label: f.label, from: text(data[f.key]), to: fetched });
      data[f.key] = fetched;
      // What was typed by hand is now confirmed by the register.
      if (provenance[f.key]?.origin === 'typed') delete provenance[f.key];
    }
    if (changes.length === 0) continue;
    const statusDate = patentStatusDate(data);
    if (statusDate !== text(data.statusDate)) {
      changes.push({ key: 'statusDate', label: 'Date of Publish/Grant of patent', from: text(data.statusDate), to: statusDate });
      data.statusDate = statusDate;
    }

    const p = resolvePeriod(m, data, cycle);
    await db.transaction(async (tx) => {
      await tx.update(records).set({
        data,
        periodYear: p.periodYear, periodLabel: p.periodLabel, cyYear: p.cyYear, fyYear: p.fyYear, ayYear: p.ayYear,
        verification: verification ? { ...verification, fields: provenance } : verification,
        // A fetched stage is not an edit by anyone: the status of the record itself is untouched.
      }).where(eq(records.id, r.id));
      await tx.insert(recordEdits).values({
        recordId: r.id, userId: null, changes, note: 'Updated automatically from the Patent Office Journal',
      });
    });
    moved += 1;
  }
  log.info('patents refreshed from the journal', { checked: rows.length, moved });
  return { checked: rows.length, moved };
}

/** The owner's "Updated automatically (last 30 days)" list: patents the journal moved forward. */
export async function autoUpdatesFor(actor: SessionUser, days = 30): Promise<AutoUpdateRow[]> {
  const m = getModule('patents');
  if (!m) return [];
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.select({
    recordId: records.id, data: records.data, at: recordEdits.at, changes: recordEdits.changes,
  })
    .from(recordEdits)
    .innerJoin(records, eq(records.id, recordEdits.recordId))
    .where(and(
      scopeFilter(actor, m), eq(records.ownerUserId, actor.id),
      isNull(recordEdits.userId), gte(recordEdits.at, since),
      sql`${recordEdits.note} like 'Updated automatically%'`,
    ))
    .orderBy(desc(recordEdits.at)).limit(20);
  return rows.map((r) => {
    const d = r.data as Record<string, unknown>;
    const no = text(d.applicationNo);
    const patentNo = text(d.patentNumber);
    const status = text(d.status);
    return {
      id: r.recordId, moduleKey: 'patents', at: r.at.toISOString(),
      text: `Patent ${no} is now ${status}${status === 'Granted' && patentNo ? ` (patent no. ${patentNo})` : ''}`,
    };
  });
}

