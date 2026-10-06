import { z } from 'zod';
import type { FieldConfig, ModuleConfig } from '@darp/shared/modules/types';
import { getAllLists } from './masterLists';
import { isValidAadhaar, isValidPan } from '@/server/crypto/pii';
import { isbn13 } from '@/server/lookup/isbn';

/** Patterns that are checked server-side, never only in the browser. */
export const PATTERNS = {
  // Accepts a bare DOI or a full https://doi.org/ URL; normalised later.
  doi: /^(https?:\/\/(dx\.)?doi\.org\/)?10\.\d{4,9}\/[-._;()/:a-zA-Z0-9]+$/,
  issn: /^\d{4}-\d{3}[\dxX]$/,
  isbn: /^(?:\d[\d-]{8,16}[\dxX])$/,
  phone: /^(\+?\d{1,3}[- ]?)?\d{6,14}$/,
  url: /^https?:\/\/[^\s]+$/i,
} as const;

function baseString(f: FieldConfig) {
  let s = z.string().trim();
  if (f.maxLength) s = s.max(f.maxLength, `Keep this under ${f.maxLength} characters.`);
  return s;
}

/** One Zod schema per field, driven entirely by its type. */
function fieldSchema(f: FieldConfig, lists: Record<string, string[]>): z.ZodTypeAny {
  switch (f.type) {
    case 'text':
      return baseString(f).max(f.maxLength ?? 500);
    case 'textarea':
      return baseString(f).max(f.maxLength ?? 5000);
    case 'email':
      return baseString(f).email('Enter a valid e-mail address.').max(200);
    case 'phone':
      return baseString(f).regex(PATTERNS.phone, 'Enter a valid phone number.');
    case 'url':
      return baseString(f).regex(PATTERNS.url, 'Enter a full link starting with http:// or https://');
    case 'doi':
      return baseString(f).regex(PATTERNS.doi, 'Enter a valid DOI, for example 10.1016/j.future.2026.107812');
    case 'issn':
      return baseString(f).regex(PATTERNS.issn, 'ISSN looks like 0167-739X.');
    case 'isbn':
      return baseString(f).refine((v) => v === '' || isbn13(v) !== null, 'Enter a valid ISBN (10 or 13 digits; the last digit is a check digit).');
    case 'pan':
      return baseString(f).refine((v) => v === '' || isValidPan(v), 'PAN looks like ABCDE1234F.');
    case 'aadhaar':
      return baseString(f).refine(
        (v) => v === '' || isValidAadhaar(v),
        'Enter a valid 12-digit Aadhaar number.',
      );
    case 'integer':
      return z.coerce.number().int('Whole numbers only.')
        .min(f.min ?? 0, `Must be at least ${f.min ?? 0}.`)
        .max(f.max ?? 1_000_000, `Must be at most ${f.max ?? 1_000_000}.`);
    case 'money':
      // Digits only — the workbook instruction is "amount in rupees, digits only".
      return z.string().trim()
        .transform((v) => v.replace(/[,\s₹]/g, ''))
        .refine((v) => /^\d+$/.test(v), 'Enter the amount in rupees, digits only.')
        .refine((v) => Number(v) <= 10_000_000_000, 'That amount looks too large.');
    case 'year':
      return z.coerce.number().int().min(1950, 'Year looks too early.').max(2100, 'Year looks too far ahead.');
    case 'date':
      return z.string().trim().refine(
        (v) => v === '' || !Number.isNaN(new Date(v).getTime()),
        'Enter a valid date.',
      );
    case 'checkbox':
      return z.boolean();
    case 'select': {
      const allowed = f.listKey ? (lists[f.listKey] ?? []) : (f.options ?? []);
      if (allowed.length === 0) return baseString(f);      // empty master list: accept, admin must fill it
      return z.string().refine((v) => v === '' || allowed.includes(v), 'Choose one of the listed values.');
    }
    case 'multiselect': {
      const allowed = f.listKey ? (lists[f.listKey] ?? []) : (f.options ?? []);
      return z.array(z.string()).refine(
        (arr) => allowed.length === 0 || arr.every((v) => allowed.includes(v)),
        'One of the selected values is not allowed.',
      );
    }
    case 'file':
      // The value is an evidence-file UUID produced by /api/evidence.
      return z.string().uuid('Upload the file again.').or(z.literal(''));
    default:
      return baseString(f);
  }
}

function isVisible(f: FieldConfig, data: Record<string, unknown>): boolean {
  if (!f.showIf) return true;
  const actual = data[f.showIf.field];
  return typeof actual === 'string' && f.showIf.in.includes(actual);
}

export interface ValidationResult {
  ok: boolean;
  data: Record<string, unknown>;
  errors: Record<string, string>;
}

/**
 * Validates a whole record against its module config.
 * `mode: 'draft'` skips required checks so a half-finished record can be saved;
 * `mode: 'submit'` enforces everything.
 */
export async function validateRecord(
  m: ModuleConfig,
  input: Record<string, unknown>,
  mode: 'draft' | 'submit',
): Promise<ValidationResult> {
  const lists = await getAllLists();
  const out: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  // Reject unknown keys outright: this is what stops a crafted body writing arbitrary JSONB.
  const known = new Set(m.fields.map((f) => f.key));
  for (const key of Object.keys(input)) {
    if (!known.has(key)) errors[key] = 'Unknown field.';
  }

  for (const f of m.fields) {
    const visible = isVisible(f, input);
    const raw = input[f.key];
    const empty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);

    if (!visible) continue;                    // hidden conditional fields are not stored

    if (empty) {
      if (f.required && mode === 'submit') errors[f.key] = `${f.label} is required.`;
      if (f.type === 'checkbox') out[f.key] = false;
      continue;
    }

    const parsed = fieldSchema(f, lists).safeParse(raw);
    if (!parsed.success) {
      errors[f.key] = parsed.error.issues[0]?.message ?? 'This value is not valid.';
      continue;
    }
    out[f.key] = parsed.data;
  }

  return { ok: Object.keys(errors).length === 0, data: out, errors };
}
