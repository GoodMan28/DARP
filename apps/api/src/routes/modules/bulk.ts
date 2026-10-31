import { z } from 'zod';
import { withRoute, ok, fail } from '@/server/http/handler';
import { readUpload } from '@/server/http/upload';
import { toResponse } from '@/server/records/toResponse';
import { BULK_MAX_BYTES } from '@/server/bulk/extract';
import {
  startBulkImport, getBulkImport, listBulkImports, attachBulkEvidence, setBulkAffiliation, submitBulk,
} from '@/server/records/bulk';

/** POST /api/modules/:moduleKey/bulk — a .txt, .csv or .xlsx file of DOIs, ISBNs or patent numbers. */
export const POST = withRoute(
  { json: false, rate: { limit: 10, windowSeconds: 60 } },
  async ({ actor, params, req, res }) => {
    if (!(req.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')) {
      return fail('UNSUPPORTED_MEDIA', { message: 'Upload the file as a form, not as JSON.' });
    }
    const declared = Number(req.get('content-length') ?? 0);
    if (Number.isFinite(declared) && declared > BULK_MAX_BYTES + 64 * 1024) {
      return fail('PAYLOAD_TOO_LARGE', { message: 'The file must be 1 MB or smaller.' });
    }
    const parsed = await readUpload(req, res, BULK_MAX_BYTES);
    if (!parsed.ok) return parsed.result;
    const { file } = parsed.upload;
    if (!file) return fail('VALIDATION', { fields: { file: 'Choose a file to upload.' } });
    try { return ok(await startBulkImport(actor, params.moduleKey!, file.name, file.bytes)); }
    catch (e) { return toResponse(e); }
  },
);

/** GET /api/modules/:moduleKey/bulk — the owner's last uploads. */
export const LIST = withRoute({ rate: { limit: 60, windowSeconds: 60 } }, async ({ actor, params }) => {
  try { return ok(await listBulkImports(actor, params.moduleKey!)); }
  catch (e) { return toResponse(e); }
});

/** GET /api/modules/:moduleKey/bulk/:id — progress, and the review table. Polled every 2 seconds. */
export const GET = withRoute({ rate: { limit: 120, windowSeconds: 60 } }, async ({ actor, params }) => {
  try { return ok(await getBulkImport(actor, params.moduleKey!, params.id!)); }
  catch (e) { return toResponse(e); }
});

const evidenceSchema = z.object({ recordId: z.string().uuid(), fileId: z.string().uuid() });

/** POST /api/modules/:moduleKey/bulk/:id/evidence — puts an uploaded file on one of the drafts. */
export const EVIDENCE = withRoute(
  { schema: evidenceSchema, rate: { limit: 120, windowSeconds: 60 } },
  async ({ actor, params, body }) => {
    try { return ok(await attachBulkEvidence(actor, params.moduleKey!, params.id!, body.recordId, body.fileId)); }
    catch (e) { return toResponse(e); }
  },
);

const affiliationSchema = z.object({ recordIds: z.array(z.string().uuid()).min(1).max(100), value: z.enum(['Yes', 'No']) });

/** POST /api/modules/:moduleKey/bulk/:id/affiliation — answers "affiliated to BIT?" on some of the drafts. */
export const AFFILIATION = withRoute(
  { schema: affiliationSchema, rate: { limit: 60, windowSeconds: 60 } },
  async ({ actor, params, body }) => {
    try { return ok(await setBulkAffiliation(actor, params.moduleKey!, params.id!, body.recordIds, body.value)); }
    catch (e) { return toResponse(e); }
  },
);

const submitSchema = z.object({ recordIds: z.array(z.string().uuid()).min(1).max(100) });

/** POST /api/modules/:moduleKey/bulk/:id/submit — submits the chosen drafts, one result each. */
export const SUBMIT = withRoute(
  { schema: submitSchema, rate: { limit: 20, windowSeconds: 60 } },
  async ({ actor, params, body }) => {
    try { return ok(await submitBulk(actor, params.moduleKey!, params.id!, body.recordIds)); }
    catch (e) { return toResponse(e); }
  },
);
