import { describe, it, expect } from 'vitest';
import { normalisePatentNumber } from '@/server/records/patentNumber';

describe('normalisePatentNumber', () => {
  it('strips the IN prefix and kind code from a new Indian application number', () => {
    expect(normalisePatentNumber('IN202331012345A', 'India')).toEqual({ value: '202331012345' });
    expect(normalisePatentNumber(' 2023 3101 2345 ', 'India')).toEqual({ value: '202331012345' });
  });

  it('upper-cases an old-format number and drops leading zeros', () => {
    expect(normalisePatentNumber('935/kol/2013', 'India')).toEqual({ value: '935/KOL/2013' });
    expect(normalisePatentNumber('0935\\KOL\\2013', 'India')).toEqual({ value: '935/KOL/2013' });
  });

  it('accepts a six-digit Indian patent number', () => {
    expect(normalisePatentNumber('436472', 'India')).toEqual({ value: '436472' });
    expect(normalisePatentNumber('IN436472B', 'India')).toEqual({ value: '436472' });
  });

  it('refuses a TEMP/E-1 filing receipt, whatever the country', () => {
    expect('error' in normalisePatentNumber('TEMP/E-1/123/2023/KOL', 'India')).toBe(true);
    expect('error' in normalisePatentNumber('TEMP/E-1/123/2023/KOL', 'United States')).toBe(true);
  });

  it('refuses an Indian number in no known format', () => {
    expect('error' in normalisePatentNumber('ABC-12', 'India')).toBe(true);
  });

  it('only tidies a foreign number', () => {
    expect(normalisePatentNumber('US 10,123,456', 'United States')).toEqual({ value: 'US10123456' });
  });
});
