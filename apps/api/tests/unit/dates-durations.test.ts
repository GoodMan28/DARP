import { describe, it, expect } from 'vitest';
import { parseYears } from '@/server/records/duration';
import { projectPeriodText, validUntilText } from '@darp/shared/projectPeriod';

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
