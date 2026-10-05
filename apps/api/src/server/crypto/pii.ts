import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';
const ALGO = 'aes-256-gcm';

function key(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) throw new Error('PII_ENCRYPTION_KEY is not set');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('PII_ENCRYPTION_KEY must decode to exactly 32 bytes');
  return buf;
}

/** Returns `v1:<iv>:<tag>:<ciphertext>`, all base64. Safe to store in JSONB. */
export function encryptPii(plain: string): string {
  if (plain === '') return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/** Throws if the value was tampered with — GCM authentication failure is a security event. */
export function decryptPii(stored: string): string {
  if (stored === '') return '';
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('pii: unrecognised ciphertext format');
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64!, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64!, 'base64')), decipher.final()]).toString('utf8');
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(`${VERSION}:`) && value.split(':').length === 4;
}

/** 12 digits → 'XXXX-XXXX-1234'. Never returns more than the last four. */
export function maskAadhaar(plain: string): string {
  const digits = plain.replace(/\D/g, '');
  if (digits.length !== 12) return 'XXXX-XXXX-XXXX';
  return `XXXX-XXXX-${digits.slice(-4)}`;
}

/** 'ABCDE1234F' → 'XXXXX1234X'. */
export function maskPan(plain: string): string {
  const v = plain.toUpperCase().trim();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)) return 'XXXXXXXXXX';
  return `XXXXX${v.slice(5, 9)}X`;
}

/* ── Partial masking for `pii: 'masked'` fields ──────────────────────────
   Used for student and contact details: a verifying office needs to see that a
   value is present and plausible without reading it in full. The owner of the
   record, and IQAC, still see the whole value. */

/** 'anita.kumari@bitmesra.ac.in' → 'a•••@bitmesra.ac.in' */
export function maskEmail(plain: string): string {
  const v = plain.trim();
  const at = v.indexOf('@');
  if (at < 1) return '•••';
  return `${v[0]}•••${v.slice(at)}`;
}

/** '+91 9876543210' → '••••••3210' */
export function maskPhone(plain: string): string {
  const digits = plain.replace(/\D/g, '');
  if (digits.length < 4) return '••••';
  return `••••••${digits.slice(-4)}`;
}

/** Any other masked value: shows the first character and the length only. */
export function maskText(plain: string): string {
  const v = String(plain).trim();
  if (v.length <= 1) return '•';
  return `${v[0]}${'•'.repeat(Math.min(v.length - 1, 8))}`;
}

/** Verhoeff checksum — the real Aadhaar check digit algorithm. Rejects typos and made-up numbers. */
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function isValidAadhaar(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  if (!/^[2-9][0-9]{11}$/.test(digits)) return false;   // Aadhaar never starts with 0 or 1
  let c = 0;
  const reversed = digits.split('').reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = D[c]![P[i % 8]![reversed[i]!]!]!;
  }
  return c === 0;
}

export function isValidPan(input: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(input.toUpperCase().trim());
}

/** Constant-time string comparison for tokens. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
