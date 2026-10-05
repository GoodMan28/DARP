import { hash, verify, type Algorithm } from '@node-rs/argon2';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from './constants';

/** `Algorithm.Argon2id` is an ambient const enum, which `isolatedModules` forbids
 *  referencing as a value. 2 is its declared member value. */
const ARGON2ID = 2 as Algorithm;

/** OWASP-recommended argon2id parameters (2024 guidance): 19 MiB, 2 iterations, parallelism 1. */
const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** A dummy hash used to keep timing constant when the account does not exist.
 *  Generated with the same parameters as a real hash, so verification costs the same. */
export const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$YWFhYWFhYWFhYWFhYWFhYQ$dGhpc2lzbm90YXJlYWxoYXNodmFsdWVhdGFsbA';

export async function hashPassword(plain: string): Promise<string> {
  assertPasswordAcceptable(plain);
  return hash(plain, OPTIONS);
}

/** Always call this, even for a non-existent account (pass DUMMY_HASH), so timing does not leak. */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

const COMMON = new Set([
  'password', 'password123', 'qwertyuiop', '123456789012', 'administrator',
  'bitmesra', 'bitmesra123', 'iqac', 'welcome1234', 'changeme1234', 'letmein12345',
]);

export class PasswordPolicyError extends Error {}

export function assertPasswordAcceptable(plain: string, context?: { email?: string; name?: string }) {
  if (plain.length < PASSWORD_MIN_LENGTH) {
    throw new PasswordPolicyError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (plain.length > PASSWORD_MAX_LENGTH) {
    throw new PasswordPolicyError('Password is too long.');
  }
  const lower = plain.toLowerCase();
  if (COMMON.has(lower)) throw new PasswordPolicyError('That password is too common.');
  if (context?.email) {
    const local = context.email.split('@')[0]?.toLowerCase();
    if (local && local.length > 2 && lower.includes(local)) {
      throw new PasswordPolicyError('Password must not contain your e-mail address.');
    }
  }
  if (context?.name) {
    const first = context.name.split(/\s+/)[0]?.toLowerCase();
    if (first && first.length > 2 && lower.includes(first)) {
      throw new PasswordPolicyError('Password must not contain your name.');
    }
  }
  // Require some variety without forcing unusable rules.
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(plain)).length;
  if (classes < 3) {
    throw new PasswordPolicyError(
      'Use a mix of upper case, lower case, digits and symbols (at least three of the four).',
    );
  }
}
