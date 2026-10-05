import type { Request, Response } from 'express';
import multer from 'multer';
import { fail, type RouteResult } from './respond';

export interface ParsedUpload {
  file: { name: string; declaredMime: string; bytes: Buffer } | null;
  fields: Record<string, string>;
}

/**
 * Parses a multipart form holding at most one file, named `file`. The size cap is
 * enforced while the body streams in, so an oversized upload is cut off at the limit
 * instead of being buffered whole first.
 */
export async function readUpload(
  req: Request, res: Response, maxBytes: number,
): Promise<{ ok: true; upload: ParsedUpload } | { ok: false; result: RouteResult }> {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 10, fieldSize: 1024, parts: 12 },
  }).single('file');

  try {
    await new Promise<void>((resolve, reject) => {
      parser(req, res, (err: unknown) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return {
        ok: false,
        result: fail('PAYLOAD_TOO_LARGE', {
          message: `Files must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.`,
        }),
      };
    }
    return { ok: false, result: fail('VALIDATION', { message: 'The upload was incomplete. Try again.' }) };
  }

  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries((req.body ?? {}) as Record<string, unknown>)) {
    if (typeof v === 'string') fields[k] = v;
  }

  const f = req.file;
  return {
    ok: true,
    upload: {
      file: f ? { name: utf8Name(f.originalname), declaredMime: f.mimetype, bytes: f.buffer } : null,
      fields,
    },
  };
}

/**
 * Browsers send the filename as raw UTF-8 bytes; the multipart parser reads them as
 * latin1. Re-decode, but keep the original if the bytes were not valid UTF-8 after all.
 */
function utf8Name(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}
