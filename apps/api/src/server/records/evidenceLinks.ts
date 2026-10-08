import { and, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { evidenceFiles } from '@/server/db/schema';
import type { ModuleConfig } from '@darp/shared/modules/types';

/** The evidence-file ids a record's file fields point at. */
function fileRefs(m: ModuleConfig, data: Record<string, unknown>): Array<{ fieldKey: string; id: string }> {
  return m.fields
    .filter((f) => f.type === 'file' && typeof data[f.key] === 'string' && data[f.key] !== '')
    .map((f) => ({ fieldKey: f.key, id: data[f.key] as string }));
}

/**
 * Which file fields point at a file this record may not take. A file belongs to a record only if
 * it is already attached to that record, or it is not attached anywhere yet and was uploaded by
 * the person saving, for that same field. Anything else — someone else's file, a deleted file,
 * a file uploaded for another field or another record — is refused, so a guessed or copied id
 * can never pull a file into a record (or out of the one it belongs to).
 */
export async function unattachableFiles(
  actorId: string, m: ModuleConfig, recordId: string | null, data: Record<string, unknown>,
): Promise<Record<string, string>> {
  const refs = fileRefs(m, data);
  if (refs.length === 0) return {};
  const rows = await db.select({
    id: evidenceFiles.id,
    fieldKey: evidenceFiles.fieldKey,
    recordId: evidenceFiles.recordId,
    uploadedBy: evidenceFiles.uploadedBy,
  }).from(evidenceFiles)
    .where(and(inArray(evidenceFiles.id, refs.map((r) => r.id)), isNull(evidenceFiles.deletedAt)));

  const errors: Record<string, string> = {};
  for (const ref of refs) {
    const row = rows.find((r) => r.id === ref.id);
    const ok = !!row && row.fieldKey === ref.fieldKey && (
      (recordId !== null && row.recordId === recordId)
      || (row.recordId === null && row.uploadedBy === actorId)
    );
    if (!ok) errors[ref.fieldKey] = 'Upload the file again.';
  }
  return errors;
}

/** Attaches the record's not-yet-attached files to it, so they inherit its read permissions. */
export async function linkEvidence(m: ModuleConfig, recordId: string, data: Record<string, unknown>) {
  const ids = fileRefs(m, data).map((r) => r.id);
  if (ids.length === 0) return;
  await db.update(evidenceFiles)
    .set({ recordId })
    .where(and(inArray(evidenceFiles.id, ids), isNull(evidenceFiles.recordId), isNull(evidenceFiles.deletedAt)));
}
