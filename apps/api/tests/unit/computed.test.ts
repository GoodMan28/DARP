import { describe, it, expect } from 'vitest';
import { applyComputed, computeValue, type ComputedRule } from '@darp/shared/computed';

describe('daysInclusive', () => {
  const days = (a: string, b: string) => computeValue({ kind: 'daysInclusive', from: 'a', to: 'b' }, { a, b });
  it('counts both the first and the last day', () => {
    expect(days('2025-03-03', '2025-03-07')).toBe('5');
    expect(days('2025-03-03', '2025-03-03')).toBe('1');
  });
  it('knows leap years and month ends', () => {
    expect(days('2024-02-28', '2024-03-01')).toBe('3');
    expect(days('2025-02-28', '2025-03-01')).toBe('2');
    expect(days('2024-12-30', '2025-01-02')).toBe('4');
  });
  it('is empty when a date is missing or the end is before the start', () => {
    expect(days('2025-03-07', '2025-03-03')).toBe('');
    expect(days('', '2025-03-03')).toBe('');
    expect(days('2025-03-03', '')).toBe('');
  });
});

describe('the other rules', () => {
  it('yearOf reads the year of a date, and leaves the value alone without one', () => {
    expect(computeValue({ kind: 'yearOf', from: 'd' }, { d: '2024-06-01' })).toBe('2024');
    expect(computeValue({ kind: 'yearOf', from: 'd' }, { d: '' })).toBeUndefined();
  });
  it('lineCount ignores blank lines, and leaves the value alone for an empty list', () => {
    expect(computeValue({ kind: 'lineCount', from: 'l' }, { l: 'Asha 1\n\nRavi 2\n  \nMina 3' })).toBe('3');
    expect(computeValue({ kind: 'lineCount', from: 'l' }, { l: '' })).toBeUndefined();
  });
  it('join skips empty parts, and copy trims', () => {
    expect(computeValue({ kind: 'join', from: ['a', 'b'], separator: ' ' }, { a: 'B.Tech.', b: '' })).toBe('B.Tech.');
    expect(computeValue({ kind: 'join', from: ['a', 'b'], separator: ' ' }, { a: 'B.Tech.', b: 'CSE' })).toBe('B.Tech. CSE');
    expect(computeValue({ kind: 'join', from: ['a', 'b'], separator: ' ' }, { a: '', b: '' })).toBeUndefined();
    expect(computeValue({ kind: 'copy', from: 'a' }, { a: '  x ' })).toBe('x');
  });
  it('listParent and instituteCountry need what they read from, and say nothing without it', () => {
    expect(computeValue({ kind: 'listParent', from: 'p' }, { p: 'M.Tech.' }, { parents: { 'M.Tech.': 'PG' } })).toBe('PG');
    expect(computeValue({ kind: 'listParent', from: 'p' }, { p: 'Odd' }, { parents: {} })).toBeUndefined();
    expect(computeValue({ kind: 'listParent', from: 'p' }, { p: 'M.Tech.' })).toBeUndefined();
    const institutes = new Map([['U-0202', { country: 'India' }]]);
    expect(computeValue({ kind: 'instituteCountry', from: 'inst' }, { instCode: 'U-0202' }, { institutes })).toBe('India');
    expect(computeValue({ kind: 'instituteCountry', from: 'inst' }, { instCode: '' }, { institutes })).toBeUndefined();
  });
  it('account gives the account’s name and joining date', () => {
    const ctx = { account: { name: 'Dr. Anil Kumar Verma', dateOfJoining: '2011-07-18' } };
    expect(computeValue({ kind: 'account', key: 'name' }, {}, ctx)).toBe('Dr. Anil Kumar Verma');
    expect(computeValue({ kind: 'account', key: 'dateOfJoining' }, {}, ctx)).toBe('2011-07-18');
    expect(computeValue({ kind: 'account', key: 'name' }, {})).toBeUndefined();
  });
});

describe('applyComputed', () => {
  it('works fields out in order, over what was sent', () => {
    const fields: Array<{ key: string; computed: ComputedRule }> = [
      { key: 'days', computed: { kind: 'daysInclusive', from: 'a', to: 'b' } },
      { key: 'label', computed: { kind: 'join', from: ['days', 'a'], separator: ' / ' } },
    ];
    expect(applyComputed(fields, { a: '2025-03-03', b: '2025-03-07', days: '99' })).toMatchObject({ days: '5', label: '5 / 2025-03-03' });
  });
});
