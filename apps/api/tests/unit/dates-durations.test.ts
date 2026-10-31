import { describe, it, expect } from 'vitest';
import { parseYears } from '@/server/records/duration';
import { projectPeriodText, validUntilText, validUntil, isActive, spanColumnText } from '@darp/shared/projectPeriod';

describe('reading an old duration', () => {
  it('reads years and months', () => {
    expect(parseYears('3 years')).toBe(3);
    expect(parseYears('36 months')).toBe(3);
    expect(parseYears('2.5 yrs')).toBe(2.5);
    expect(parseYears('18 months')).toBe(1.5);
  });
  it('gives up when there is no number', () => {
    expect(parseYears('three')).toBeNull();
    expect(parseYears('')).toBeNull();
  });
});

describe('spans from a date and years', () => {
  it('works out a project period and its financial years', () => {
    expect(projectPeriodText('2025-04-01', 1)).toBe('01-04-2025 to 31-03-2026 (1 year) · FY 2025-26 to FY 2025-26');
    expect(projectPeriodText('2025-02-12', 3)).toBe('12-02-2025 to 11-02-2028 (3 years) · FY 2024-25 to FY 2027-28');
    expect(projectPeriodText('', 3)).toBe('');
  });
  it('marks an MoU expired once its last day has passed', () => {
    expect(validUntilText('2020-01-01', 2, new Date('2026-10-29'))).toBe('31-12-2021 (expired)');
    expect(validUntilText('2026-01-01', 2, new Date('2026-10-29'))).toBe('31-12-2027');
  });
});

describe('an award’s validity', () => {
  const today = new Date('2026-10-30');
  it('ends the day before the anniversary, for any number of years', () => {
    expect(validUntil('2024-03-15', '2')).toEqual(new Date('2026-03-14'));
    expect(validUntilText('2024-03-15', '2', today)).toBe('14-03-2026 (expired)');
    expect(validUntilText('2026-01-01', 1, today)).toBe('31-12-2026');
    expect(validUntilText('2024-03-15', '5', today)).toBe('14-03-2029');
    expect(validUntilText('2024-01-01', '1.5', today)).toBe('30-06-2025 (expired)');
  });
  it('never ends when it is for life', () => {
    expect(validUntil('2024-03-15', '', true)).toBe('lifetime');
    expect(validUntilText('1999-01-01', '', today, true)).toBe('Lifetime');
    expect(isActive('1999-01-01', '', true, today)).toBe(true);
    expect(spanColumnText('awards', { awardDate: '1999-01-01', validForLife: true })).toBe('Lifetime');
  });
  it('is active up to and including its last day', () => {
    expect(isActive('2024-10-31', '2', false, today)).toBe(true);   // last day 30-10-2026
    expect(isActive('2024-10-30', '2', false, today)).toBe(false);  // last day 29-10-2026
    expect(isActive('', '2', false, today)).toBe(false);
    expect(isActive('2024-10-31', '', false, today)).toBe(false);
  });
  it('says what an old record is missing instead of inventing a date', () => {
    expect(spanColumnText('awards', { awardDate: '2023-06-01' })).toBe('Validity not given');
    expect(spanColumnText('awards', { awardDate: '2023-06-01', validForLife: false })).toBe('Validity not given');
    expect(spanColumnText('awards', { validityYears: '2' })).toBe('Date not given');
    expect(spanColumnText('mous', { signingDate: '2023-06-01' })).toBe('Duration not given');
  });
});
