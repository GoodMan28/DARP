import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { ModuleConfig, RecordStatus } from '@darp/shared/modules/types';
import type { BulkImport, BulkItem, BulkItemStatus, BulkSubmitResult, RecordVerification } from '@darp/shared/contracts';
import { db } from '@/server/db';
import { bulkImports, bulkImportItems, records } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { canCreateIn } from '@/server/auth/permissions';
import {
  createRecord, updateRecord, transitionRecord, getRecord, mustGetModule, ServiceError,
} from './service';
import { scopeFilter } from './scope';
import { resolve } from '@/server/lookup/resolve';
import { isLookupUnavailable } from '@/server/lookup/http';
import { misplacedWork, authorshipOf, evidenceMissing, personOf, sourceOf } from '@/server/lookup/apply';
import { ownerIdentity } from '@/server/lookup/identity';
import { fieldFor } from '@/server/lookup/form';
import { normaliseDoiInput } from '@/server/lookup/doi';
import { audit } from '@/server/audit/log';
import { log } from '@/server/log';
import { extractIdentifiers } from '@/server/bulk/extract';

/** Between two registry calls, so a run of 100 DOIs stays polite to Crossref. */
const PAUSE_MS = Number(process.env.BULK_PAUSE_MS ?? 1000);

/** Imports being worked on by this server process. One left 'running' but not here was cut off by a restart. */
const active = new Set<string>();

function lookupModule(actor: SessionUser, moduleKey: string): ModuleConfig {
  const m = mustGetModule(moduleKey);
  if (!m.lookup) throw new ServiceError('NOT_FOUND', 'This module cannot be filled from a file.');
  if (!canCreateIn(actor, m)) throw new ServiceError('FORBIDDEN', 'This module is not yours to add to.');
  return m;
}

/** The file field the record's evidence goes in. */
const evidenceKeyOf = (m: ModuleConfig) => m.lookup?.evidenceField ?? m.fields.find((f) => f.type === 'file')?.key ?? null;

/** Reads the file, stores one item per identifier and starts fetching them. Returns at once. */
export async function startBulkImport(
  actor: SessionUser, moduleKey: string, fileName: string, bytes: Buffer,
): Promise<{ id: string; total: number }> {
  const m = lookupModule(actor, moduleKey);
  const found = await extractIdentifiers(fileName, bytes, m.lookup!.kind, m.lookup!.idLabel);
  if (!found.ok) throw new ServiceError('VALIDATION', found.message, { file: found.message });

  const [row] = await db.insert(bulkImports).values({
    ownerUserId: actor.id, moduleKey: m.key, fileName: fileName.slice(0, 200), status: 'running', total: found.ids.length,
  }).returning({ id: bulkImports.id });
  await db.insert(bulkImportItems).values(found.ids.map((raw, position) => ({ importId: row!.id, position, raw })));
  await audit({
    actor, action: 'bulk.start', entity: 'bulk_import', entityId: row!.id,
    after: { moduleKey: m.key, fileName, total: found.ids.length },
  });

  active.add(row!.id);
  void runImport(actor, m, row!.id).finally(() => active.delete(row!.id));
  return { id: row!.id, total: found.ids.length };
}

/** The owner's own record already holding this identifier, if any. */
async function ownRecordWith(actor: SessionUser, m: ModuleConfig, key: string, value: string): Promise<string | null> {
  const [hit] = await db.select({ id: records.id }).from(records).where(and(
    scopeFilter(actor, m), eq(records.ownerUserId, actor.id),
    sql`lower(${records.data}->>${key}) = ${value.toLowerCase()}`,
  )).limit(1);
  return hit?.id ?? null;
}

interface Outcome { status: BulkItemStatus; recordId?: string | null; message?: string }

/**
 * A draft holding the identifier, through the normal save: filled and locked from the register when it
 * was found, as if the owner had pressed "Fetch details" and "Save as draft"; otherwise just the
 * identifier, for the owner to complete. The owner is trusted: whatever the check found, the draft is
 * made, and what it found is shown beside it.
 */
async function draftIn(actor: SessionUser, m: ModuleConfig, raw: string, storedId: string, why: Outcome): Promise<Outcome> {
  const field = fieldFor(m, raw);
  if (!field) return { status: 'error', message: `This does not look like a valid ${m.lookup!.idLabel}.` };
  const mine = await ownRecordWith(actor, m, field.key, storedId);
  if (mine) return { status: 'exists', recordId: mine, message: 'You have already added this one.' };
  try {
    const created = await createRecord(actor, m.key, { [field.key]: storedId }, 'draft');
    return { ...why, recordId: created.id };
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'CONFLICT') return { status: 'exists', message: e.message };
    if (e instanceof ServiceError) return { status: 'error', message: e.message };
    throw e;
  }
}

/** One identifier from the file: fetched, checked, and saved as a draft unless it is already recorded. */
async function processItem(actor: SessionUser, m: ModuleConfig, raw: string): Promise<Outcome> {
  const field = fieldFor(m, raw);
  if (!field) return { status: 'error', message: `This does not look like a valid ${m.lookup!.idLabel}.` };
  const typedId = field.type === 'doi' ? (normaliseDoiInput(raw) ?? raw) : raw;
  const word = personOf(m) === 'inventor' ? 'inventors' : 'authors';

  let r;
  try {
    r = await resolve(m.lookup!.kind, raw);
  } catch (e) {
    if (!isLookupUnavailable(e)) throw e;
    return draftIn(actor, m, raw, typedId, {
      status: 'error',
      message: 'The register could not be reached just now, so only the number was saved. Open the draft to fill in the details; saving it tries the fetch again.',
    });
  }
  if (!r.found) {
    return draftIn(actor, m, raw, typedId, {
      status: 'not-found',
      message: `Not found in ${m.lookup!.kind === 'patent' ? 'the Patent Office Journal issues DARP has read' : 'the publisher registers'}. A draft holds the number: open it to type the details and attach evidence.`,
    });
  }

  // It belongs in another module: the draft is made there. A preprint belongs nowhere.
  const misplaced = misplacedWork(m, r);
  if (misplaced) {
    const target = misplaced.moveTo ? mustGetModule(misplaced.moveTo) : null;
    if (!target || !canCreateIn(actor, target)) return { status: 'wrong-module', message: misplaced.message };
    return draftIn(actor, target, raw, typedId, {
      status: 'wrong-module',
      message: `${misplaced.message.replace(/ Add it under .*$/, '')} The draft was made under ${target.name}.`,
    });
  }

  // Saved under the number it is recorded by: a patent found by its grant number, by its application number.
  const storedId = m.lookup!.kind === 'patent' && r.values.applicationNo ? r.values.applicationNo : typedId;
  const who = await ownerIdentity(actor.id, actor.name);
  // A grant found without its application has no inventor list to look for the owner in.
  const listed = r.people.length > 0 && !r.flags.includes('grant-only');
  if (listed && authorshipOf(m, r, who).level === 'unmatched') {
    return draftIn(actor, m, raw, storedId, {
      status: 'not-yours',
      message: `Your name is not in the ${personOf(m)} list of ${sourceOf(m)}. Open the draft, add your name to the ${word} and attach evidence.`,
    });
  }
  return draftIn(actor, m, raw, storedId, { status: 'created' });
}

async function runImport(actor: SessionUser, m: ModuleConfig, importId: string) {
  try {
    const items = await db.select().from(bulkImportItems)
      .where(and(eq(bulkImportItems.importId, importId), eq(bulkImportItems.status, 'pending')))
      .orderBy(asc(bulkImportItems.position));
    for (const [i, item] of items.entries()) {
      if (i > 0 && m.lookup!.kind !== 'patent') await new Promise((res) => setTimeout(res, PAUSE_MS));
      let outcome: Outcome;
      try {
        outcome = await processItem(actor, m, item.raw);
      } catch (e) {
        log.error('bulk: item failed', { importId, error: (e as Error).message });
        outcome = { status: 'error', message: 'Something went wrong with this one. Add it with "Add record".' };
      }
      await db.update(bulkImportItems).set({
        status: outcome.status, recordId: outcome.recordId ?? null, message: outcome.message?.slice(0, 1000) ?? null,
      }).where(eq(bulkImportItems.id, item.id));
      await db.update(bulkImports).set({ done: sql`${bulkImports.done} + 1` }).where(eq(bulkImports.id, importId));
    }
    await db.update(bulkImports).set({ status: 'done' }).where(eq(bulkImports.id, importId));
  } catch (e) {
    log.error('bulk: import failed', { importId, error: (e as Error).message });
    await db.update(bulkImports).set({ status: 'failed' }).where(eq(bulkImports.id, importId));
  }
}

async function ownImport(actor: SessionUser, m: ModuleConfig, id: string) {
  const [row] = await db.select().from(bulkImports)
    .where(and(eq(bulkImports.id, id), eq(bulkImports.moduleKey, m.key), eq(bulkImports.ownerUserId, actor.id)))
    .limit(1);
  if (!row) throw new ServiceError('NOT_FOUND', 'Upload not found.');
  return row;
}

const text = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/**
 * The modules an upload's drafts can be in: its own, and those its wrong-module lines go to
 * (a conference paper uploaded to Publications becomes a draft under Books, Chapters & Conference Papers).
 */
function draftModules(actor: SessionUser, m: ModuleConfig): ModuleConfig[] {
  const others = (m.lookup?.elsewhere ?? []).map((e) => e.moduleKey).filter((k): k is string => !!k);
  return [m, ...[...new Set(others)].map((k) => mustGetModule(k)).filter((x) => canCreateIn(actor, x))];
}

function evidenceOf(m: ModuleConfig) {
  const key = evidenceKeyOf(m);
  const f = key ? m.fields.find((x) => x.key === key) : undefined;
  return f ? { fieldKey: f.key, label: f.label, accept: f.accept ?? null, maxSizeMB: f.maxSizeMB ?? 2, required: !!f.required } : null;
}

interface DraftRow { id: string; status: RecordStatus; data: unknown; verification: unknown; ownerUserId: string }

/** The upload, each identifier's outcome and, for each draft made, what is still needed to submit it. */
export async function getBulkImport(actor: SessionUser, moduleKey: string, id: string): Promise<BulkImport> {
  const m = lookupModule(actor, moduleKey);
  let row = await ownImport(actor, m, id);
  // Cut off by a server restart: what was not reached is said so, and the upload ends.
  if (row.status === 'running' && !active.has(row.id)) {
    await db.update(bulkImportItems).set({ status: 'error', message: 'Not reached: the server restarted. Upload this one again.' })
      .where(and(eq(bulkImportItems.importId, row.id), eq(bulkImportItems.status, 'pending')));
    await db.update(bulkImports).set({ status: 'failed' }).where(eq(bulkImports.id, row.id));
    row = { ...row, status: 'failed' };
  }

  const items = await db.select().from(bulkImportItems)
    .where(eq(bulkImportItems.importId, row.id)).orderBy(asc(bulkImportItems.position));
  const ids = items.map((i) => i.recordId).filter((x): x is string => !!x);
  const byId = new Map<string, { m: ModuleConfig; rec: DraftRow }>();
  if (ids.length > 0) {
    for (const dm of draftModules(actor, m)) {
      const recs = await db.select({
        id: records.id, status: records.status, data: records.data, verification: records.verification, ownerUserId: records.ownerUserId,
      }).from(records).where(and(scopeFilter(actor, dm), inArray(records.id, ids)));
      for (const rec of recs) byId.set(rec.id, { m: dm, rec });
    }
  }

  const out: BulkItem[] = items.map((i) => {
    const hit = i.recordId ? byId.get(i.recordId) : undefined;
    const base = { id: i.id, raw: i.raw, status: i.status as BulkItemStatus, message: i.message };
    if (!hit) return { ...base, record: null };
    const { m: rm, rec } = hit;
    const data = (rec.data ?? {}) as Record<string, unknown>;
    const title = text(data.title) || text(data.chapterTitle) || text(data.bookTitle) || text(data[rm.listColumns[0] ?? '']);
    const verification = (rec.verification ?? null) as RecordVerification | null;
    const ev = evidenceOf(rm);
    return {
      ...base,
      record: {
        id: rec.id,
        moduleKey: rm.key,
        moduleName: rm.name,
        status: rec.status,
        mine: rec.ownerUserId === actor.id,
        title,
        evidence: ev ? { fieldKey: ev.fieldKey, label: ev.label, accept: ev.accept, maxSizeMB: ev.maxSizeMB } : null,
        evidenceId: (ev && text(data[ev.fieldKey])) || null,
        needsEvidence: !!ev && (ev.required || !!evidenceMissing(rm, { ...data, [ev.fieldKey]: '' }, verification)),
        points: verification?.reasons ?? [],
        affiliation: rm.fields.some((f) => f.key === AFFILIATION_KEY) ? text(data[AFFILIATION_KEY]) : null,
      },
    };
  });

  return {
    id: row.id, moduleKey: m.key, fileName: row.fileName, status: row.status as BulkImport['status'],
    total: row.total, done: row.done, createdAt: row.createdAt.toISOString(), items: out,
  };
}

/** The owner's recent uploads for this module, newest first. */
export async function listBulkImports(actor: SessionUser, moduleKey: string) {
  const m = lookupModule(actor, moduleKey);
  const rows = await db.select({
    id: bulkImports.id, fileName: bulkImports.fileName, status: bulkImports.status, total: bulkImports.total,
    done: bulkImports.done, createdAt: bulkImports.createdAt,
  }).from(bulkImports)
    .where(and(eq(bulkImports.ownerUserId, actor.id), eq(bulkImports.moduleKey, m.key)))
    .orderBy(desc(bulkImports.createdAt)).limit(10);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** The module of a draft this upload made, or a 404: an upload's endpoints touch only its own drafts. */
async function draftOf(actor: SessionUser, m: ModuleConfig, importId: string, recordId: string): Promise<ModuleConfig> {
  await ownImport(actor, m, importId);
  const [item] = await db.select({ id: bulkImportItems.id }).from(bulkImportItems)
    .where(and(eq(bulkImportItems.importId, importId), eq(bulkImportItems.recordId, recordId))).limit(1);
  if (!item) throw new ServiceError('NOT_FOUND', 'That record is not part of this upload.');
  for (const dm of draftModules(actor, m)) {
    const [hit] = await db.select({ id: records.id }).from(records)
      .where(and(scopeFilter(actor, dm), eq(records.id, recordId))).limit(1);
    if (hit) return dm;
  }
  throw new ServiceError('NOT_FOUND', 'That record no longer exists.');
}

/** Puts an uploaded evidence file on one of the upload's drafts, saving it as a draft still. */
export async function attachBulkEvidence(
  actor: SessionUser, moduleKey: string, importId: string, recordId: string, fileId: string,
) {
  const m = lookupModule(actor, moduleKey);
  const rm = await draftOf(actor, m, importId, recordId);
  const key = evidenceKeyOf(rm);
  if (!key) throw new ServiceError('VALIDATION', 'This module takes no evidence file.');
  const rec = await getRecord(actor, rm.key, recordId);
  if (!rec.editValues) throw new ServiceError('FORBIDDEN', 'This record can no longer be edited.');
  return updateRecord(actor, rm.key, recordId, { ...rec.editValues, [key]: fileId }, 'draft');
}

/** The question every paper is asked: affiliated to BIT when it was published? */
const AFFILIATION_KEY = 'affiliatedToBit';

/**
 * Answers "affiliated to BIT when published?" on some of the upload's drafts, saving them as drafts
 * still. A draft made from a file has no answer yet, and it is needed before it can be submitted.
 */
export async function setBulkAffiliation(
  actor: SessionUser, moduleKey: string, importId: string, recordIds: string[], value: 'Yes' | 'No',
) {
  const m = lookupModule(actor, moduleKey);
  let done = 0;
  for (const recordId of [...new Set(recordIds)]) {
    const rm = await draftOf(actor, m, importId, recordId);
    if (!rm.fields.some((f) => f.key === AFFILIATION_KEY)) continue;
    const rec = await getRecord(actor, rm.key, recordId);
    if (!rec.editValues) continue;                   // submitted since: no longer editable
    await updateRecord(actor, rm.key, recordId, { ...rec.editValues, [AFFILIATION_KEY]: value }, 'draft');
    done += 1;
  }
  return { updated: done };
}

/** A refusal in one line: the message, or the first field problems. */
function refusal(e: ServiceError, m: ModuleConfig): string {
  const fields = Object.entries(e.fields ?? {});
  if (fields.length === 0) return e.message;
  return fields.slice(0, 3).map(([k, msg]) => {
    const label = m.fields.find((f) => f.key === k)?.label;
    return label && !msg.includes(label) ? `${label}: ${msg}` : msg;
  }).join(' ');
}

/** Submits each chosen draft through the normal submit, one by one: one refused does not stop the rest. */
export async function submitBulk(
  actor: SessionUser, moduleKey: string, importId: string, recordIds: string[],
): Promise<BulkSubmitResult[]> {
  const m = lookupModule(actor, moduleKey);
  await ownImport(actor, m, importId);
  const out: BulkSubmitResult[] = [];
  for (const recordId of [...new Set(recordIds)]) {
    let rm = m;
    try {
      rm = await draftOf(actor, m, importId, recordId);
      const r = await transitionRecord(actor, rm.key, recordId, 'submit');
      out.push({ recordId, ok: true, status: r.status, message: null });
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
      out.push({ recordId, ok: false, status: null, message: refusal(e, rm) });
    }
  }
  return out;
}
