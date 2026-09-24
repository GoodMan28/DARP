import 'server-only';
import { and, count, eq, gte, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { evidenceFiles, records } from '@/server/db/schema';
import { getModule } from '@/modules';
import type { ModuleConfig } from '@/modules/_types';
import type { SessionUser } from '@/server/auth/session';
import { canReadRecord, canEditRecord } from '@/server/auth/permissions';
import { scopeFilter } from '@/server/records/scope';
import { ServiceError, mustGetModule } from '@/server/records/service';
import { audit } from '@/server/audit/log';
import { log } from '@/server/log';
import {
  storage, sniff, safeDisplayName, DEFAULT_ACCEPT,
} from './storage';

/**
 * The hard ceiling. `MAX_UPLOAD_MB` may lower it but never raise it above 5 MB,
 * because the `evidence_size_rule` CHECK constraint in the database refuses more.
 */
const DB_MAX_BYTES = 5_242_880;
const DAILY_UPLOAD_LIMIT = 100;

export function maxUploadBytes(): number {
  const configured = Number(process.env.MAX_UPLOAD_MB ?? 5);
  const mb = Number.isFinite(configured) && configured > 0 ? configured : 5;
  return Math.min(Math.floor(mb * 1024 * 1024), DB_MAX_BYTES);
}

/** The field_key CHECK constraint on `evidence_files`, enforced before we reach the database. */
const FIELD_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

export interface UploadInput {
  bytes: Buffer;
  fileName: string;
  declaredMime: string;
  fieldKey: string;
  /** Optional: the module the field belongs to, so `accept` comes from the config, not the client. */
  moduleKey?: string | null;
  /** Optional: attach straight to an existing record the caller may edit. */
  recordId?: string | null;
  ip?: string;
}

export interface UploadedEvidence {
  id: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Looks up the accepted extensions from the module config. The browser's `accept`
 * attribute is a hint to the user, never an authority on the server.
 */
function acceptFor(m: ModuleConfig | null, fieldKey: string): string[] {
  const field = m?.fields.find((f) => f.key === fieldKey && f.type === 'file');
  const accept = field?.accept?.filter((e) => typeof e === 'string' && e.length > 0);
  return accept && accept.length > 0 ? accept : DEFAULT_ACCEPT;
}

/** The record a file may be attached to must be one the caller is allowed to edit. */
async function assertMayAttach(actor: SessionUser, moduleKey: string, recordId: string) {
  const m = mustGetModule(moduleKey);
  const [row] = await db
    .select({
      id: records.id,
      cycleId: records.cycleId,
      ownerUserId: records.ownerUserId,
      departmentId: records.departmentId,
      status: records.status,
    })
    .from(records)
    .where(and(eq(records.id, recordId), isNull(records.deletedAt)))
    .limit(1);
  if (!row) throw new ServiceError('NOT_FOUND', 'Record not found.');

  // Re-run the query through the scope filter: the id alone is never sufficient.
  const [scoped] = await db
    .select({ id: records.id })
    .from(records)
    .where(and(scopeFilter(actor, m, row.cycleId), eq(records.id, recordId)))
    .limit(1);
  if (!scoped) throw new ServiceError('NOT_FOUND', 'Record not found.');

  if (!canEditRecord(actor, m, {
    ownerUserId: row.ownerUserId, departmentId: row.departmentId, status: row.status,
  })) {
    throw new ServiceError('FORBIDDEN', 'This record can no longer be edited.');
  }
}

export async function uploadEvidence(
  actor: SessionUser, input: UploadInput,
): Promise<UploadedEvidence> {
  if (!FIELD_KEY_RE.test(input.fieldKey)) {
    throw new ServiceError('VALIDATION', 'Invalid field.', { fieldKey: 'Invalid field.' });
  }
  if (input.bytes.length > maxUploadBytes()) {
    throw new ServiceError(
      'VALIDATION',
      `Files must be ${Math.floor(maxUploadBytes() / 1024 / 1024)} MB or smaller.`,
      { file: `Files must be ${Math.floor(maxUploadBytes() / 1024 / 1024)} MB or smaller.` },
    );
  }

  const m = input.moduleKey ? getModule(input.moduleKey) : null;
  if (input.moduleKey && !m) throw new ServiceError('NOT_FOUND', 'That module does not exist.');
  if (m && !m.fields.some((f) => f.key === input.fieldKey && f.type === 'file')) {
    throw new ServiceError('VALIDATION', 'Invalid field.', { fieldKey: 'Invalid field.' });
  }

  if (input.recordId) {
    if (!m) throw new ServiceError('VALIDATION', 'A module is required to attach a file.');
    await assertMayAttach(actor, m.key, input.recordId);
  }

  // Per-user daily quota: one account cannot fill the disk on its own.
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const [used] = await db
    .select({ n: count() })
    .from(evidenceFiles)
    .where(and(eq(evidenceFiles.uploadedBy, actor.id), gte(evidenceFiles.uploadedAt, since)));
  if ((used?.n ?? 0) >= DAILY_UPLOAD_LIMIT) {
    throw new ServiceError(
      'VALIDATION',
      'Daily upload limit reached. Contact IQAC if you need more.',
    );
  }

  const check = sniff(
    input.bytes, input.fileName, acceptFor(m, input.fieldKey), input.declaredMime,
  );
  if (!check.ok || !check.ext || !check.mime) {
    throw new ServiceError('VALIDATION', check.reason ?? 'That file type is not allowed.', {
      file: check.reason ?? 'That file type is not allowed.',
    });
  }

  const stored = await storage.put(input.bytes, check.ext);

  try {
    const [row] = await db.insert(evidenceFiles).values({
      recordId: input.recordId ?? null,
      fieldKey: input.fieldKey,
      storageKey: stored.storageKey,
      originalName: safeDisplayName(input.fileName),
      mimeType: check.mime,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      uploadedBy: actor.id,
    }).returning({
      id: evidenceFiles.id,
      originalName: evidenceFiles.originalName,
      sizeBytes: evidenceFiles.sizeBytes,
      mimeType: evidenceFiles.mimeType,
    });
    if (!row) throw new Error('evidence row was not created');

    await audit({
      actor, action: 'evidence.upload', entity: 'evidence', entityId: row.id, ip: input.ip,
      meta: {
        fieldKey: input.fieldKey,
        moduleKey: m?.key ?? null,
        recordId: input.recordId ?? null,
        sizeBytes: stored.sizeBytes,
        sha256: stored.sha256,
        mimeType: check.mime,
      },
    });
    return row;
  } catch (err) {
    // Never leave bytes on disk that no row points at.
    await storage.remove(stored.storageKey);
    throw err;
  }
}

/* ─────────────────────────────── download ─────────────────────────────── */

export interface EvidenceForDownload {
  id: string;
  originalName: string;
  mimeType: string;
  bytes: Buffer;
}

interface EvidenceRow {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  uploadedBy: string;
  recordId: string | null;
}

async function loadEvidence(id: string): Promise<EvidenceRow | null> {
  const [row] = await db
    .select({
      id: evidenceFiles.id,
      storageKey: evidenceFiles.storageKey,
      originalName: evidenceFiles.originalName,
      mimeType: evidenceFiles.mimeType,
      uploadedBy: evidenceFiles.uploadedBy,
      recordId: evidenceFiles.recordId,
    })
    .from(evidenceFiles)
    .where(and(eq(evidenceFiles.id, id), isNull(evidenceFiles.deletedAt)))
    .limit(1);
  return row ?? null;
}

type Access = 'read' | 'edit';

/**
 * A file attached to a record inherits that record's permissions exactly — the check goes
 * back through `scopeFilter` and `canReadRecord`, so there is one authorisation model, not two.
 * "Not allowed" and "does not exist" give the same answer, so ids cannot be probed.
 */
async function assertMayAccess(actor: SessionUser, row: EvidenceRow, mode: Access) {
  if (!row.recordId) {
    // A freshly uploaded file, not yet attached, belongs only to its uploader (and IQAC).
    if (row.uploadedBy !== actor.id && actor.role !== 'admin') {
      throw new ServiceError('NOT_FOUND', 'Not found.');
    }
    return;
  }

  const [rec] = await db
    .select({
      moduleKey: records.moduleKey,
      cycleId: records.cycleId,
      ownerUserId: records.ownerUserId,
      departmentId: records.departmentId,
      status: records.status,
    })
    .from(records)
    .where(and(eq(records.id, row.recordId), isNull(records.deletedAt)))
    .limit(1);
  if (!rec) throw new ServiceError('NOT_FOUND', 'Not found.');

  const m = getModule(rec.moduleKey);
  if (!m) throw new ServiceError('NOT_FOUND', 'Not found.');

  const [scoped] = await db
    .select({ id: records.id })
    .from(records)
    .where(and(scopeFilter(actor, m, rec.cycleId), eq(records.id, row.recordId)))
    .limit(1);
  if (!scoped) throw new ServiceError('NOT_FOUND', 'Not found.');

  const ownership = {
    ownerUserId: rec.ownerUserId, departmentId: rec.departmentId, status: rec.status,
  };
  const allowed = mode === 'read'
    ? canReadRecord(actor, m, ownership)
    : canEditRecord(actor, m, ownership);
  if (!allowed) throw new ServiceError('NOT_FOUND', 'Not found.');
}

export async function getEvidenceForDownload(
  actor: SessionUser, id: string, ip?: string,
): Promise<EvidenceForDownload> {
  const row = await loadEvidence(id);
  if (!row) throw new ServiceError('NOT_FOUND', 'Not found.');
  await assertMayAccess(actor, row, 'read');

  let bytes: Buffer;
  try {
    bytes = await storage.get(row.storageKey);
  } catch (err) {
    log.error('evidence bytes missing', {
      evidenceId: row.id, error: err instanceof Error ? err.message : 'unknown',
    });
    throw new ServiceError('NOT_FOUND', 'Not found.');
  }

  await audit({
    actor, action: 'evidence.download', entity: 'evidence', entityId: row.id, ip,
    meta: { originalName: row.originalName },
  });

  return {
    id: row.id, originalName: row.originalName, mimeType: row.mimeType, bytes,
  };
}

/* ──────────────────────────────── delete ──────────────────────────────── */

export async function deleteEvidence(
  actor: SessionUser, id: string, ip?: string,
): Promise<{ id: string; deleted: true }> {
  const row = await loadEvidence(id);
  if (!row) throw new ServiceError('NOT_FOUND', 'Not found.');
  // Removing evidence is an edit of the owning record, so it needs edit rights, not read rights.
  await assertMayAccess(actor, row, 'edit');

  await db.update(evidenceFiles)
    .set({ deletedAt: new Date() })
    .where(eq(evidenceFiles.id, row.id));
  await storage.remove(row.storageKey);

  await audit({
    actor, action: 'evidence.delete', entity: 'evidence', entityId: row.id, ip,
    before: { originalName: row.originalName, recordId: row.recordId },
  });
  return { id: row.id, deleted: true };
}
