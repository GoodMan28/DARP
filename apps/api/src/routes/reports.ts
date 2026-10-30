import { withRoute, ok, fail, file } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { audit } from '@/server/audit/log';
import { log } from '@/server/log';
import {
  reportOptions, readReportRequest, summariseReport, generateReport, departmentNamesOf,
} from '@/server/export/reports';

/** GET /api/reports/options — the formats, workbooks, modules and departments this person may choose. */
export const OPTIONS = withRoute({ capability: 'export', rate: { limit: 60, windowSeconds: 60 } }, async ({ actor }) => {
  try { return ok(await reportOptions(actor)); }
  catch (e) { return toResponse(e); }
});

/** GET /api/reports/:format/summary?… — the rows each sheet would hold, for the preview. */
export const SUMMARY = withRoute({ capability: 'export', rate: { limit: 60, windowSeconds: 60 } }, async ({ actor, params, query }) => {
  try { return ok(await summariseReport(actor, readReportRequest(actor, params.format!, query))); }
  catch (e) { return toResponse(e); }
});

/**
 * GET /api/reports/:format?from=2022&to=2024&yearType=auto&departments=<ids>&modules=<keys>&workbook=<key>
 * — the report as an Excel file. Approved records only, within the caller's own scope.
 */
export const GET = withRoute(
  { capability: 'export', rate: { limit: 10, windowSeconds: 300 } },
  async ({ actor, params, query, ip }) => {
    let q;
    try { q = readReportRequest(actor, params.format!, query); }
    catch (e) { return toResponse(e); }

    const departmentNames = await departmentNamesOf(q.departmentIds);
    let result;
    try {
      result = await generateReport(actor, q, departmentNames);
    } catch (err) {
      log.error('report generation failed', {
        format: q.format, workbook: q.workbook, userId: actor.id, error: err instanceof Error ? err.message : 'unknown',
      });
      return fail('INTERNAL', { message: 'The report could not be built. IQAC has been notified.' });
    }

    // Revealing Aadhaar/PAN is its own audited event, separate from the export itself.
    if (result.piiRevealed > 0) {
      await audit({
        actor, action: 'pii.reveal', entity: 'export', entityId: q.workbook ?? q.format, ip,
        meta: { format: q.format, workbook: q.workbook, valuesRevealed: result.piiRevealed, reason: q.reason },
      });
    }
    await audit({
      actor, action: 'export.generate', entity: 'export', entityId: q.workbook ?? q.format, ip,
      meta: {
        format: q.format, workbook: q.workbook, mode: result.mode, from: q.range.from, to: q.range.to,
        yearType: q.yearType, departments: departmentNames, modules: q.moduleKeys,
        includePii: q.includePii, reason: q.includePii ? q.reason : undefined,
        sheets: result.sheetsWritten, rows: result.rowsWritten,
      },
    });

    const buffer = await result.workbook.xlsx.writeBuffer();
    return file(new Uint8Array(buffer as ArrayBuffer), {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${result.fileName}"`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    });
  },
);
