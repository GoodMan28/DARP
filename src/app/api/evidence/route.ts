import { withRoute, ok, fail } from '@/server/http/handler';
import { uploadEvidence, maxUploadBytes } from '@/server/evidence/service';
import { ServiceError } from '@/server/records/service';

/**
 * POST /api/evidence — multipart upload.
 *
 * Any signed-in user may upload: every role owns at least one module with a file field, and the
 * file is worthless until it is attached to a record the caller may edit (checked in the service).
 * `withRoute` still enforces session, CSRF, the forced password change and the rate limit.
 */
export const POST = withRoute(
  { json: false, rate: { limit: 30, windowSeconds: 60 } },
  async ({ actor, req, ip }) => {
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      return fail('UNSUPPORTED_MEDIA', { message: 'Upload the file as a form, not as JSON.' });
    }

    const maxBytes = maxUploadBytes();
    // Refuse an oversized body before reading any of it into memory.
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (Number.isFinite(declared) && declared > maxBytes + 64 * 1024) {
      return fail('PAYLOAD_TOO_LARGE', {
        message: `Files must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.`,
      });
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail('VALIDATION', { message: 'The upload was incomplete. Try again.' });
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return fail('VALIDATION', { fields: { file: 'Choose a file to upload.' } });
    }
    if (file.size > maxBytes) {
      return fail('PAYLOAD_TOO_LARGE', {
        message: `Files must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.`,
      });
    }

    const fieldKey = String(form.get('fieldKey') ?? '');
    const moduleKeyRaw = form.get('moduleKey');
    const recordIdRaw = form.get('recordId');

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > maxBytes) return fail('PAYLOAD_TOO_LARGE');

    try {
      const row = await uploadEvidence(actor, {
        bytes,
        fileName: file.name,
        // A hint only — the bytes decide the real type.
        declaredMime: file.type,
        fieldKey,
        moduleKey: moduleKeyRaw ? String(moduleKeyRaw) : null,
        recordId: recordIdRaw ? String(recordIdRaw) : null,
        ip,
      });
      return ok(row);
    } catch (err) {
      if (err instanceof ServiceError) {
        return fail(err.code, { message: err.message, ...(err.fields ? { fields: err.fields } : {}) });
      }
      throw err;
    }
  },
);
