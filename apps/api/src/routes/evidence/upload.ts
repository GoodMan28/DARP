import { withRoute, ok, fail } from '@/server/http/handler';
import { readUpload } from '@/server/http/upload';
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
  async ({ actor, req, res, ip }) => {
    const contentType = req.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      return fail('UNSUPPORTED_MEDIA', { message: 'Upload the file as a form, not as JSON.' });
    }

    const maxBytes = maxUploadBytes();
    // Refuse an oversized body before reading any of it into memory.
    const declared = Number(req.get('content-length') ?? 0);
    if (Number.isFinite(declared) && declared > maxBytes + 64 * 1024) {
      return fail('PAYLOAD_TOO_LARGE', {
        message: `Files must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.`,
      });
    }

    // The cap is enforced again while the body streams in, which also covers an upload
    // sent without a Content-Length that the check above cannot see.
    const parsed = await readUpload(req, res, maxBytes);
    if (!parsed.ok) return parsed.result;

    const { file, fields } = parsed.upload;
    if (!file) {
      return fail('VALIDATION', { fields: { file: 'Choose a file to upload.' } });
    }
    if (file.bytes.length > maxBytes) return fail('PAYLOAD_TOO_LARGE');

    try {
      const row = await uploadEvidence(actor, {
        bytes: file.bytes,
        fileName: file.name,
        // A hint only — the bytes decide the real type.
        declaredMime: file.declaredMime,
        fieldKey: fields.fieldKey ?? '',
        moduleKey: fields.moduleKey || null,
        recordId: fields.recordId || null,
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
