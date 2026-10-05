import { randomInt } from 'node:crypto';

/* ─────────────────── temporary password generation ───────────────────
   Generated server-side with node:crypto only. Returned to the creating
   admin exactly once, in the create/reset response, and never stored or
   logged in plaintext — only its argon2id hash reaches the database. */

const LOWER = 'abcdefghijkmnopqrstuvwxyz';     // no l
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';      // no I, O
const DIGITS = '23456789';                     // no 0, 1
const SYMBOLS = '!@#$%&*+-=?';
const TEMP_PASSWORD_LENGTH = 16;

function pick(set: string): string {
  return set.charAt(randomInt(set.length));
}

/** 16 characters, one from each of the four classes, then a crypto shuffle. */
export function generateTemporaryPassword(): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < TEMP_PASSWORD_LENGTH) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const a = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = a;
  }
  return chars.join('');
}

/* ──────────────────────────── shared shapes ─────────────────────────── */

export const ROLE_VALUES = ['faculty', 'hod', 'dofa', 'drie', 'dugs', 'cdc', 'admin'] as const;

/** Mirrors the `users_department_rule` check constraint so the DB never has to raise a 500. */
export const DEPARTMENT_REQUIRED_ROLES: readonly string[] = ['faculty', 'hod'];
