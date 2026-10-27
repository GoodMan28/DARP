import { describe, it, expect, vi } from 'vitest';
import { MODULES } from '@darp/shared/modules';
import {
  formatAwardValidity,
  validateAndNormalizeValidity,
  displayValue,
  PREDEFINED_VALIDITY_OPTIONS,
} from '@darp/shared/format';
import { validateRecord } from '@/server/records/validate';

vi.mock('@/server/records/masterLists', () => ({
  getAllLists: async () => ({
    awardLevels: ['State', 'National', 'International'],
  }),
  getList: async () => [],
  invalidateListCache: () => {},
}));

describe('Award Validity Field — Unit & Business Rules', () => {
  const awards = MODULES.awards!;

  describe('Module Configuration', () => {
    it('contains the awardValidity field in the awards module', () => {
      const field = awards.fields.find((f) => f.key === 'awardValidity');
      expect(field).toBeDefined();
      expect(field?.label).toBe('Award Validity');
      expect(field?.type).toBe('validity');
      expect(field?.required).toBe(false);
      expect(field?.section).toBe('Award');
    });

    it('contains the exact 7 dropdown options', () => {
      const field = awards.fields.find((f) => f.key === 'awardValidity');
      expect(field?.options).toEqual([
        '1 Year',
        '2 Years',
        '3 Years',
        '5 Years',
        '10 Years',
        'Lifetime',
        'Custom',
      ]);
      expect(PREDEFINED_VALIDITY_OPTIONS).toEqual([
        '1 Year',
        '2 Years',
        '3 Years',
        '5 Years',
        '10 Years',
        'Lifetime',
        'Custom',
      ]);
    });

    it('includes awardValidity in listColumns for table display', () => {
      expect(awards.listColumns).toContain('awardValidity');
    });
  });

  describe('Valid Predefined Values', () => {
    const predefinedCases = [
      { input: '1', expected: '1' },
      { input: 1, expected: '1' },
      { input: '1 Year', expected: '1' },
      { input: '2', expected: '2' },
      { input: 2, expected: '2' },
      { input: '2 Years', expected: '2' },
      { input: '3', expected: '3' },
      { input: 3, expected: '3' },
      { input: '3 Years', expected: '3' },
      { input: '5', expected: '5' },
      { input: 5, expected: '5' },
      { input: '5 Years', expected: '5' },
      { input: '10', expected: '10' },
      { input: 10, expected: '10' },
      { input: '10 Years', expected: '10' },
      { input: 'Lifetime', expected: 'Lifetime' },
    ];

    for (const { input, expected } of predefinedCases) {
      it(`accepts predefined value: ${input}`, () => {
        const res = validateAndNormalizeValidity(input);
        expect(res.valid).toBe(true);
        expect(res.canonical).toBe(expected);
      });
    }
  });

  describe('Valid Custom Values', () => {
    const customCases = [
      { input: '4', expected: '4' },
      { input: 4, expected: '4' },
      { input: '6', expected: '6' },
      { input: 6, expected: '6' },
      { input: '7', expected: '7' },
      { input: 7, expected: '7' },
      { input: '15', expected: '15' },
      { input: 15, expected: '15' },
      { input: '20', expected: '20' },
      { input: 20, expected: '20' },
      { input: '0.25', expected: '0.25' },
      { input: 0.25, expected: '0.25' },
      { input: '0.5', expected: '0.5' },
      { input: 0.5, expected: '0.5' },
      { input: '0.75', expected: '0.75' },
      { input: 0.75, expected: '0.75' },
    ];

    for (const { input, expected } of customCases) {
      it(`accepts valid custom value: ${input}`, () => {
        const res = validateAndNormalizeValidity(input);
        expect(res.valid).toBe(true);
        expect(res.canonical).toBe(expected);
      });
    }
  });

  describe('Exact Display Formatting', () => {
    const formattingCases = [
      { input: '0.25', expected: '0.25 Years (3 Months)' },
      { input: '0.5', expected: '0.5 Years (6 Months)' },
      { input: '0.75', expected: '0.75 Years (9 Months)' },
      { input: '1', expected: '1 Year' },
      { input: '2', expected: '2 Years' },
      { input: '3', expected: '3 Years' },
      { input: '4', expected: '4 Years' },
      { input: '5', expected: '5 Years' },
      { input: '7', expected: '7 Years' },
      { input: '10', expected: '10 Years' },
      { input: '15', expected: '15 Years' },
      { input: 'Lifetime', expected: 'Lifetime' },
    ];

    for (const { input, expected } of formattingCases) {
      it(`formats stored value "${input}" -> "${expected}"`, () => {
        expect(formatAwardValidity(input)).toBe(expected);
        expect(displayValue(input, 'validity')).toBe(expected);
        expect(displayValue(input, undefined, 'awardValidity')).toBe(expected);
      });
    }

    it('formats empty or undefined values as dash', () => {
      expect(formatAwardValidity('')).toBe('—');
      expect(formatAwardValidity(null)).toBe('—');
      expect(formatAwardValidity(undefined)).toBe('—');
    });
  });

  describe('Invalid Values Rejection', () => {
    const invalidCases = [
      { input: '0', reason: 'zero' },
      { input: 0, reason: 'numeric zero' },
      { input: '-1', reason: 'negative string' },
      { input: -1, reason: 'negative number' },
      { input: '0.1', reason: 'unsupported fraction 0.1' },
      { input: 0.1, reason: 'unsupported fraction numeric 0.1' },
      { input: '0.2', reason: 'unsupported fraction 0.2' },
      { input: 0.2, reason: 'unsupported fraction numeric 0.2' },
      { input: '0.3', reason: 'unsupported fraction 0.3' },
      { input: '0.6', reason: 'unsupported fraction 0.6' },
      { input: '1.5', reason: 'unsupported fraction 1.5' },
      { input: 1.5, reason: 'unsupported fraction numeric 1.5' },
      { input: '2.5', reason: 'unsupported fraction 2.5' },
      { input: 'abc', reason: 'alphabetic text' },
      { input: 'Custom', reason: 'empty custom input selection' },
      { input: '1..2', reason: 'malformed decimal' },
      { input: '0.25.5', reason: 'malformed decimal' },
      { input: '--1', reason: 'malformed negative' },
    ];

    for (const { input, reason } of invalidCases) {
      it(`rejects invalid value: ${input} (${reason})`, () => {
        const res = validateAndNormalizeValidity(input);
        expect(res.valid).toBe(false);
        expect(res.error).toBeDefined();
        expect(typeof res.error).toBe('string');
      });
    }
  });

  describe('Backend validateRecord Integration', () => {
    const baseAward = {
      awardYear: '2023',
      awardName: 'National Science Excellence Award',
      level: 'National',
      agency: 'DST',
      evidence: '550e8400-e29b-41d4-a716-446655440000',
    };

    it('validates a record with predefined awardValidity', async () => {
      const res = await validateRecord(awards, { ...baseAward, awardValidity: '1 Year' }, 'submit');
      expect(res.ok).toBe(true);
      expect(res.data.awardValidity).toBe('1');
    });

    it('validates a record with custom integer awardValidity', async () => {
      const res = await validateRecord(awards, { ...baseAward, awardValidity: '4' }, 'submit');
      expect(res.ok).toBe(true);
      expect(res.data.awardValidity).toBe('4');
    });

    it('validates a record with custom fractional awardValidity', async () => {
      const res = await validateRecord(awards, { ...baseAward, awardValidity: '0.25' }, 'submit');
      expect(res.ok).toBe(true);
      expect(res.data.awardValidity).toBe('0.25');
    });

    it('supports validity alias and maps to awardValidity', async () => {
      const res = await validateRecord(awards, { ...baseAward, validity: '0.5' }, 'submit');
      expect(res.ok).toBe(true);
      expect(res.data.awardValidity).toBe('0.5');
    });

    it('rejects invalid fraction in validateRecord', async () => {
      const res = await validateRecord(awards, { ...baseAward, awardValidity: '0.6' }, 'submit');
      expect(res.ok).toBe(false);
      expect(res.errors.awardValidity).toBeDefined();
    });

    it('rejects zero or negative in validateRecord', async () => {
      const resZero = await validateRecord(awards, { ...baseAward, awardValidity: '0' }, 'submit');
      expect(resZero.ok).toBe(false);
      expect(resZero.errors.awardValidity).toBeDefined();

      const resNeg = await validateRecord(awards, { ...baseAward, awardValidity: '-1' }, 'submit');
      expect(resNeg.ok).toBe(false);
      expect(resNeg.errors.awardValidity).toBeDefined();
    });

    it('preserves backward compatibility with historical records without awardValidity', async () => {
      const res = await validateRecord(awards, { ...baseAward }, 'submit');
      expect(res.ok).toBe(true);
      expect(res.data.awardValidity).toBeUndefined();
    });
  });
});
