import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { loadBitLists } from '../helpers/lists';
import { validateRecord } from '@/server/records/validate';
import { getModule } from '@darp/shared/modules';
import { COUNTRIES } from '../../scripts/data/countries';
import { bitListRows } from '../../scripts/data/bit-lists';

/* Phase 2 of the decisions plan: the Patents country list is the whole world, not nine names. */

const patents = getModule('patents')!;
const draft = (country: string) => validateRecord(patents, { title: 'A thing', country }, 'draft');

beforeAll(async () => { await truncateAll(); await loadBitLists(); });
afterAll(async () => { await closeDb(); });

describe('the countries list', () => {
  it('has India first, no repeats, the two patent offices, and Other last', () => {
    expect(COUNTRIES[0]).toBe('India');
    expect(COUNTRIES.at(-1)).toBe('Other');
    expect(COUNTRIES.slice(-3, -1)).toEqual(['European Patent Office', 'WIPO (PCT)']);
    expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
    expect(COUNTRIES.length).toBeGreaterThan(190);
  });

  it('keeps every name an old record or the patent lookup can hold', () => {
    for (const old of ['India', 'United States', 'United Kingdom', 'Germany', 'Japan', 'Australia', 'Canada', 'Singapore', 'Other']) {
      expect(COUNTRIES).toContain(old);
    }
  });

  it('is part of what the lists script and a new install load', () => {
    expect(bitListRows().filter((r) => r.listKey === 'countries')).toHaveLength(COUNTRIES.length);
  });
});

describe('a patent filed in', () => {
  it.each(['Germany', 'France', 'Türkiye', 'WIPO (PCT)', 'European Patent Office', 'India', 'Other'])('%s is accepted', async (country) => {
    expect((await draft(country)).errors.country).toBeUndefined();
  });

  it('a name that is not on the list is refused', async () => {
    expect((await draft('Atlantis')).errors.country).toBe('Choose one of the listed values.');
  });
});
