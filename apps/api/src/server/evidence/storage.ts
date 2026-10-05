import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/* ─────────────────────────────── storage ─────────────────────────────── */

export interface StoredFile { storageKey: string; sha256: string; sizeBytes: number }

export interface StorageAdapter {
  put(bytes: Buffer, ext: string): Promise<StoredFile>;
  get(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}

/** Evidence lives OUTSIDE `public/`: nothing here is ever reachable as a static URL. */
function root(): string {
  return resolve(process.env.EVIDENCE_DIR ?? './storage/evidence');
}

/**
 * Defence against a storage key that tries to escape the evidence directory (T11).
 * Keys are always server-generated, so anything that does not look like one is an attack.
 */
export function safePath(storageKey: string): string {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(storageKey)) {
    throw new Error('invalid storage key');
  }
  const base = root();
  const full = resolve(join(base, storageKey));
  if (!full.startsWith(base + sep)) throw new Error('path escapes the evidence directory');
  return full;
}

export const localStorageAdapter: StorageAdapter = {
  async put(bytes, ext) {
    // Two levels: a random shard directory keeps any single folder small.
    const storageKey = `${randomUUID()}/${randomUUID()}.${ext}`;
    const full = safePath(storageKey);
    /* eslint-disable security/detect-non-literal-fs-filename --
       every path here comes from safePath(), which accepts only a server-generated
       UUID key and refuses anything that resolves outside EVIDENCE_DIR. */
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, bytes, { mode: 0o640 });
    /* eslint-enable security/detect-non-literal-fs-filename */
    return {
      storageKey,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.length,
    };
  },
  async get(storageKey) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- safePath() validated
    return readFile(safePath(storageKey));
  },
  async remove(storageKey) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- safePath() validated
    await unlink(safePath(storageKey)).catch(() => undefined);
  },
};

/**
 * Vercel's serverless functions have an ephemeral, effectively read-only filesystem — anything
 * `localStorageAdapter` writes disappears between requests. This adapter is the same interface
 * backed by Vercel Blob instead, selected by `STORAGE_DRIVER=blob` (see .env.example).
 *
 * Security is unchanged, not weakened: `access: 'public'` only means "fetchable by anyone who
 * has the exact URL" — that URL is never sent to the browser. The download route
 * (src/app/api/evidence/[id]/route.ts) re-checks scopeFilter()/canReadRecord() on every request
 * and only then calls storage.get() itself; a caller who is not authorised for a record never
 * learns its blob URL exists.
 */
export const vercelBlobStorageAdapter: StorageAdapter = {
  async put(bytes, ext) {
    const { put } = await import('@vercel/blob');
    const pathname = `evidence/${randomUUID()}/${randomUUID()}.${ext}`;
    const blob = await put(pathname, bytes, {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/octet-stream', // real type is served by the route, from the DB column
    });
    return {
      storageKey: blob.url, // the opaque key IS the blob URL — never handed to the client
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.length,
    };
  },
  async get(storageKey) {
    const res = await fetch(storageKey);
    if (!res.ok) throw new Error('evidence blob not found');
    return Buffer.from(await res.arrayBuffer());
  },
  async remove(storageKey) {
    const { del } = await import('@vercel/blob');
    await del(storageKey).catch(() => undefined);
  },
};

/** Swap this one binding to move to object storage later (locked decision #4). */
export const storage: StorageAdapter =
  process.env.STORAGE_DRIVER === 'blob' ? vercelBlobStorageAdapter : localStorageAdapter;

/* ───────────────────────── content-based type checking ───────────────────────── */

export interface AllowedType { ext: string; mime: string; magic: (b: Buffer) => boolean }

/** The only file types DARP accepts. Nothing executable, nothing scriptable. */
export const ALLOWED_TYPES: AllowedType[] = [
  {
    ext: 'pdf',
    mime: 'application/pdf',
    magic: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  {
    ext: 'jpg',
    mime: 'image/jpeg',
    magic: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: 'png',
    mime: 'image/png',
    magic: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
];

export const DEFAULT_ACCEPT = ['pdf', 'jpg', 'jpeg', 'png'];

export interface SniffResult { ok: boolean; ext?: string; mime?: string; reason?: string }

function normaliseExts(ext: string): string[] {
  return ext === 'jpg' ? ['jpg', 'jpeg'] : [ext];
}

/**
 * Decides the type from the BYTES, never from the filename and never from the browser's
 * Content-Type. A .pdf that is really an .exe is rejected here (T9). `declaredMime` is
 * checked too, but only as an extra reason to refuse — never as evidence of anything.
 */
export function sniff(
  bytes: Buffer,
  claimedName: string,
  allowedExts: string[],
  declaredMime?: string,
): SniffResult {
  if (bytes.length === 0) return { ok: false, reason: 'The file is empty.' };

  const match = ALLOWED_TYPES.find((t) => t.magic(bytes));
  if (!match) return { ok: false, reason: 'Only PDF, JPG and PNG files are accepted.' };

  const allowed = allowedExts
    .map((e) => e.toLowerCase().trim().replace(/^\./, ''))
    .filter((e) => e.length > 0);
  const normalised = normaliseExts(match.ext);
  if (allowed.length && !normalised.some((e) => allowed.includes(e))) {
    return { ok: false, reason: `This field accepts ${allowed.join(', ').toUpperCase()} only.` };
  }

  // A mismatched extension is suspicious enough to refuse.
  const claimedExt = claimedName.split('.').pop()?.toLowerCase() ?? '';
  if (claimedExt && !normalised.includes(claimedExt === 'jpeg' ? 'jpg' : claimedExt)) {
    return { ok: false, reason: 'The file contents do not match its extension.' };
  }

  // The browser-supplied MIME type must agree as well; disagreement means someone is lying.
  if (declaredMime) {
    const declared = declaredMime.split(';')[0]?.trim().toLowerCase() ?? '';
    const acceptableMimes = match.ext === 'jpg' ? ['image/jpeg', 'image/jpg'] : [match.mime];
    if (declared && !acceptableMimes.includes(declared)) {
      return { ok: false, reason: 'The file contents do not match the declared file type.' };
    }
  }

  return { ok: true, ext: match.ext, mime: match.mime };
}

/** Filenames are shown to other people — strip anything dangerous or confusing. */
export function safeDisplayName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex -- matching control characters is the point
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
  return cleaned.length > 0 ? cleaned : 'document';
}
