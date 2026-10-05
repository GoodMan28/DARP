import { withRoute, ok, fail, file } from '@/server/http/handler';
import { getEvidenceForDownload, deleteEvidence } from '@/server/evidence/service';
import { ServiceError } from '@/server/records/service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quoted filenames break on a quote or a newline; RFC 5987 covers the non-ASCII case. */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * GET /api/evidence/[id] — the only way to read an evidence file. Files live outside
 * `public/`, so there is no static path to guess, and the service re-checks that the caller
 * may read the owning record before a single byte is sent.
 */
export const GET = withRoute(
  { rate: { limit: 120, windowSeconds: 60 } },
  async ({ actor, params, ip }) => {
    const id = params.id ?? '';
    if (!UUID_RE.test(id)) return fail('NOT_FOUND');

    try {
      const evidence = await getEvidenceForDownload(actor, id, ip);
      return file(new Uint8Array(evidence.bytes), {
        'content-type': evidence.mimeType,
        // Always a download, never rendered in place: kills stored XSS through a file.
        'content-disposition': contentDisposition(evidence.originalName),
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'cache-control': 'private, no-store',
      });
    } catch (err) {
      if (err instanceof ServiceError) return fail(err.code, { message: err.message });
      throw err;
    }
  },
);

/** DELETE /api/evidence/[id] — soft-deletes the row and removes the bytes. */
export const DELETE = withRoute(
  { rate: { limit: 60, windowSeconds: 60 } },
  async ({ actor, params, ip }) => {
    const id = params.id ?? '';
    if (!UUID_RE.test(id)) return fail('NOT_FOUND');

    try {
      return ok(await deleteEvidence(actor, id, ip));
    } catch (err) {
      if (err instanceof ServiceError) return fail(err.code, { message: err.message });
      throw err;
    }
  },
);
