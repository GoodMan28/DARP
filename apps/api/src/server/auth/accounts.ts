import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { composeName, splitName, NAME_PREFIXES, type NameParts } from '@darp/shared/names';

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

/* ───────────────────────────── names in parts ───────────────────────────── */

/** The name fields an account form sends. `name` alone (one piece) is still accepted and split. */
export const NAME_FIELDS = {
  name: z.string().trim().max(160).nullish(),
  namePrefix: z.string().trim().max(20).nullish(),
  firstName: z.string().trim().max(60).nullish(),
  middleName: z.string().trim().max(60).nullish(),
  lastName: z.string().trim().max(60).nullish(),
};

type NameInput = { [K in keyof typeof NAME_FIELDS]?: string | null };

/**
 * The parts and the display name to store, or the field errors. The prefix must be one of the list;
 * the first name is required; middle and last names are optional (some names have no surname).
 */
export function namePartsFrom(body: NameInput):
  { ok: true; parts: NameParts; name: string } | { ok: false; fields: Record<string, string> } {
  const parts: NameParts = body.firstName?.trim()
    ? { prefix: body.namePrefix ?? '', first: body.firstName, middle: body.middleName ?? '', last: body.lastName ?? '' }
    : splitName(body.name ?? '');
  const fields: Record<string, string> = {};
  if (parts.prefix && !(NAME_PREFIXES as readonly string[]).includes(parts.prefix)) {
    fields.namePrefix = `Choose one of: ${NAME_PREFIXES.join(', ')}.`;
  }
  if (parts.first.trim().length < 2) fields.firstName = 'Enter the first name.';
  for (const [k, v] of [['firstName', parts.first], ['middleName', parts.middle], ['lastName', parts.last]] as const) {
    if (/[0-9@<>]/.test(v)) fields[k] = 'Letters, spaces, dots, hyphens and apostrophes only.';
  }
  if (Object.keys(fields).length) return { ok: false, fields };
  return { ok: true, parts, name: composeName(parts) };
}
