import { withRoute, fail, file } from '@/server/http/handler';
import { generateWorkbook } from '@/server/export/excel';
import { WORKBOOK_KEYS } from '@/server/export/mapping';
import { activeCycle, ServiceError } from '@/server/records/service';
import { hasCapability } from '@/server/auth/permissions';
import { audit } from '@/server/audit/log';
import { log } from '@/server/log';
import type { Role, WorkbookKey } from '@darp/shared/modules/types';

/**
 * Which office may export which workbook. Admin (IQAC) may export all.
 *
 * Note: `hod` has no `export` capability in `permissions.ts`, so an HOD is refused by the route
 * wrapper before this map is consulted. The entry is kept so that granting the capability is the
 * only change needed, and the department filter below is already in place for it.
 */
const ALLOWED: Record<Role, WorkbookKey[]> = {
  admin: WORKBOOK_KEYS,
  drie: ['drie'],
  dofa: ['dofa', 'faculty'],
  dugs: ['dugs'],
  cdc: ['cdc'],
  hod: ['hod'],
  faculty: [],
};

export const GET = withRoute(
  { capability: 'export', rate: { limit: 10, windowSeconds: 300 } },
  async ({ actor, params, query: sp, ip }) => {
    const key = params.workbook as WorkbookKey;
    if (!WORKBOOK_KEYS.includes(key)) return fail('NOT_FOUND');
    if (!ALLOWED[actor.role].includes(key)) return fail('FORBIDDEN');

    const wantsPii = sp.get('includePii') === '1';
    const reason = (sp.get('reason') ?? '').trim().slice(0, 500);

    // Plaintext Aadhaar/PAN leaves the system only for IQAC, only with a stated reason.
    if (wantsPii && (!hasCapability(actor, 'revealPii') || reason.length < 10)) {
      return fail('FORBIDDEN', {
        message: 'A written reason is required to export unmasked personal data, and only IQAC may do it.',
      });
    }

    let cycleId: string;
    try {
      cycleId = (await activeCycle()).id;
    } catch (err) {
      if (err instanceof ServiceError) return fail(err.code, { message: err.message });
      throw err;
    }

    // An HOD export is limited to their own department; every other office exports institute-wide.
    const departmentId = actor.role === 'hod' ? actor.departmentId : null;

    let result;
    try {
      result = await generateWorkbook(key, { cycleId, includePii: wantsPii, departmentId, actor });
    } catch (err) {
      log.error('export generation failed', {
        workbook: key, userId: actor.id,
        error: err instanceof Error ? err.message : 'unknown',
      });
      return fail('INTERNAL', {
        message: 'The export template and the field mapping do not match. IQAC has been notified.',
      });
    }

    // Revealing Aadhaar/PAN is its own audited event, separate from the export itself.
    if (result.piiRevealed > 0) {
      await audit({
        actor, action: 'pii.reveal', entity: 'export', entityId: key, ip,
        meta: { workbook: key, valuesRevealed: result.piiRevealed, reason },
      });
    }

    await audit({
      actor, action: 'export.generate', entity: 'export', entityId: key, ip,
      meta: {
        workbook: key,
        mode: result.mode,
        includePii: wantsPii,
        reason: wantsPii ? reason : undefined,
        departmentId,
        sheets: result.sheetsWritten,
        rows: result.rowsWritten,
      },
    });

    const buffer = await result.workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer as ArrayBuffer);
    const stamp = new Date().toISOString().slice(0, 10);
    return file(bytes, {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="DARP-${key}-${stamp}.xlsx"`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    });
  },
);
