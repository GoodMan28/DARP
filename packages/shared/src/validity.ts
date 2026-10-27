// packages/shared/src/validity.ts

export const PREDEFINED_VALIDITY_OPTIONS = [
  '1 Year',
  '2 Years',
  '3 Years',
  '5 Years',
  '10 Years',
  'Lifetime',
  'Custom',
] as const;

export type PredefinedValidityOption = (typeof PREDEFINED_VALIDITY_OPTIONS)[number];

export const PREDEFINED_VALIDITY_MAP: Record<string, string> = {
  '1 Year': '1',
  '2 Years': '2',
  '3 Years': '3',
  '5 Years': '5',
  '10 Years': '10',
  'Lifetime': 'Lifetime',
};

export const CANONICAL_TO_PREDEFINED: Record<string, string> = {
  '1': '1 Year',
  '2': '2 Years',
  '3': '3 Years',
  '5': '5 Years',
  '10': '10 Years',
  'Lifetime': 'Lifetime',
};

export const VALIDITY_FRACTION_DISPLAY: Record<string, string> = {
  '0.25': '0.25 Years (3 Months)',
  '0.5': '0.5 Years (6 Months)',
  '0.75': '0.75 Years (9 Months)',
};

export interface ValidityValidationResult {
  valid: boolean;
  canonical?: string;
  error?: string;
}

/**
 * Validates and normalizes Award Validity values.
 * Accepted predefined values: '1', '2', '3', '5', '10', 'Lifetime', or option labels '1 Year', etc.
 * Accepted custom values: any positive whole number representing years (4, 6, 7, 15, 20...)
 * and strictly three fractional values: '0.25', '0.5', and '0.75'.
 * Rejected: 0, negative numbers, unsupported fractions (0.1, 0.2, 0.3, 0.6, 1.5, 2.5),
 * alphabetic text, arbitrary strings, and malformed numeric values.
 */
export function validateAndNormalizeValidity(raw: unknown): ValidityValidationResult {
  if (raw === undefined || raw === null || raw === '') {
    return { valid: true, canonical: '' };
  }

  if (raw === 'Lifetime') {
    return { valid: true, canonical: 'Lifetime' };
  }

  const str = String(raw).trim();
  if (!str) {
    return { valid: true, canonical: '' };
  }

  if (str === 'Lifetime') {
    return { valid: true, canonical: 'Lifetime' };
  }

  if (str === 'Custom') {
    return { valid: false, error: 'Enter a custom validity period.' };
  }

  if (str in PREDEFINED_VALIDITY_MAP) {
    return { valid: true, canonical: PREDEFINED_VALIDITY_MAP[str] };
  }

  // Predefined canonical integers (1, 2, 3, 5, 10) or any positive whole number
  if (/^[1-9]\d*$/.test(str)) {
    return { valid: true, canonical: str };
  }

  // Strictly allowed fractional values: 0.25, 0.5, 0.75
  if (/^(0?\.250*|0?\.50*|0?\.750*)$/.test(str)) {
    const num = parseFloat(str);
    if (num === 0.25) return { valid: true, canonical: '0.25' };
    if (num === 0.5) return { valid: true, canonical: '0.5' };
    if (num === 0.75) return { valid: true, canonical: '0.75' };
  }

  // Number validation: identify 0, negative numbers, or invalid fractions
  if (typeof raw === 'number' || /^-?\d+(\.\d+)?$/.test(str)) {
    const num = Number(str);
    if (num <= 0) {
      return { valid: false, error: 'Award validity must be greater than zero.' };
    }
    return {
      valid: false,
      error: 'Custom validity must be a positive whole number or one of 0.25, 0.5, 0.75 years.',
    };
  }

  return {
    valid: false,
    error: 'Enter a valid validity period (e.g. 1 Year, 2 Years, Lifetime, or positive years / 0.25, 0.5, 0.75).',
  };
}

/**
 * Formats an award validity value for display.
 * Predefined: '1' -> '1 Year', '2' -> '2 Years', 'Lifetime' -> 'Lifetime'.
 * Fractions: '0.25' -> '0.25 Years (3 Months)', '0.5' -> '0.5 Years (6 Months)', '0.75' -> '0.75 Years (9 Months)'.
 * Other positive integers: '4' -> '4 Years', etc.
 */
export function formatAwardValidity(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  const str = String(value).trim();
  if (str === 'Lifetime') return 'Lifetime';
  if (VALIDITY_FRACTION_DISPLAY[str]) return VALIDITY_FRACTION_DISPLAY[str]!;
  if (/^[1-9]\d*$/.test(str)) {
    return str === '1' ? '1 Year' : `${str} Years`;
  }
  return str;
}
