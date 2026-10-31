import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { institutions } from '@/server/db/schema';
import { aisheRowOf, buildDirectory, buildEntries, markAbsorbed, rorRowOf, storeInstitutions, type RorRow } from '@/server/institutions/import';
import { csvRows } from '@/server/institutions/csvStream';
import { institutesByCode, searchInstitutes } from '@/server/institutions/service';

/* Phase 5: the institute directory: AISHE and ROR, merged, searched. Small files stand in for the real ones. */

const FIXTURES = join(__dirname, '..', 'fixtures', 'institutions');
const aishe = (JSON.parse(readFileSync(join(FIXTURES, 'aishe.json'), 'utf8')) as Array<Record<string, unknown>>)
  .map(aisheRowOf).filter((r) => r !== null);

async function loadRor(): Promise<RorRow[]> {
  const out: RorRow[] = [];
  for await (const row of csvRows(join(FIXTURES, 'ror.csv'))) {
    const r = rorRowOf(row);
    if (r) out.push(r);
  }
  return out;
}

beforeAll(async () => {
  await truncateAll();
  await storeInstitutions(buildEntries(aishe, await loadRor(), 'test files').values());
});
afterAll(async () => { await closeDb(); });

describe('reading the files', () => {
  it('reads quoted cells with commas, doubled quotes and line breaks, and skips inactive entries', async () => {
    const ror = await loadRor();
    expect(ror.map((r) => r.id)).toEqual(['028vtqb15', '03kgp0001', '04paris01', '05acme001']);
    const acme = ror.find((r) => r.id === '05acme001')!;
    expect(acme.name).toBe('Acme Robotics, Inc.');
    expect(acme.aliases[0]).toContain('"Acme" Group');
    expect(acme.aliases[0]).toContain('\n');
  });

  it('ignores an AISHE row without a valid code', () => {
    expect(aishe.map((r) => r.code)).not.toContain('not-a-code');
    expect(aishe).toHaveLength(6);
  });
});

describe('the directory', () => {
  it('has one entry for an institute AISHE lists twice, the other spelling kept as an alias', async () => {
    const [bits] = await db.select().from(institutions).where(eq(institutions.code, 'U-0391'));
    expect(bits!.name).toBe('Birla Institute of Technology & Sciences, Pilani');
    expect(bits!.aliases).toContain('Birla Institute of Technology and Science, Pilani');
    expect(bits).toMatchObject({ scheme: 'aishe', state: 'Rajasthan', city: 'Jhunjhunu', country: 'India', kind: 'university' });
  });

  it('merges an Indian ROR entry into the AISHE entry it is the same institute as', async () => {
    const [iit] = await db.select().from(institutions).where(eq(institutions.code, 'U-0050'));
    expect(iit).toMatchObject({ rorId: '03kgp0001', scheme: 'aishe' });
    expect(iit!.aliases).toEqual(expect.arrayContaining(['iit kharagpur', 'IIT KGP, IITKGP']));
    const rows = await db.select({ code: institutions.code }).from(institutions);
    expect(rows.map((r) => r.code)).not.toContain('ROR-03kgp0001');
  });

  it('is BIT Mesra under U-0202, with its ROR id, and not twice', async () => {
    const [bit] = await db.select().from(institutions).where(eq(institutions.code, 'U-0202'));
    expect(bit).toMatchObject({ name: 'Birla Institute of Technology, Mesra', rorId: '028vtqb15', state: 'Jharkhand', status: 'active' });
    const rows = await db.select({ code: institutions.code }).from(institutions);
    expect(rows.map((r) => r.code)).not.toContain('ROR-028vtqb15');
  });

  it('merges when AISHE writes the place after the name and ROR does not', async () => {
    const entries = buildEntries(
      [{ code: 'U-0209', name: 'Ranchi University, Ranchi', state: 'Jharkhand', district: 'Ranchi' }],
      [{ id: '01hcvr073', name: 'Ranchi University', aliases: [], labels: ['Ranchi University'], city: 'Ranchi', state: 'Jharkhand', country: 'India', countryCode: 'IN', types: 'education', website: '' }],
      'x',
    );
    expect([...entries.keys()].filter((c) => c !== 'U-0202')).toEqual(['U-0209']);
    expect(entries.get('U-0209')).toMatchObject({ rorId: '01hcvr073' });
  });

  it('adds the rest of ROR beside it: foreign universities and companies', async () => {
    const rows = await db.select({ code: institutions.code, scheme: institutions.scheme, country: institutions.country }).from(institutions);
    expect(rows.filter((r) => r.scheme === 'ror').map((r) => `${r.code}:${r.country}`).sort())
      .toEqual(['ROR-04paris01:France', 'ROR-05acme001:United States']);
  });

  it('marks an earlier stand-alone ROR entry merged once a newer load folds it into an AISHE entry', async () => {
    await db.insert(institutions).values({
      code: 'ROR-03kgp0001', scheme: 'ror', name: 'Indian Institute of Technology Kharagpur', country: 'India', countryCode: 'IN',
      rorId: '03kgp0001', searchText: 'indian institute of technology kharagpur ror 03kgp0001',
    });
    const { absorbed } = buildDirectory(aishe, await loadRor(), 'test files');
    expect(await markAbsorbed(absorbed)).toBe(1);
    const [old] = await db.select().from(institutions).where(eq(institutions.code, 'ROR-03kgp0001'));
    expect(old).toMatchObject({ status: 'merged', mergedInto: 'U-0050' });
    expect((await searchInstitutes('Indian Institute of Technology Kharagpur')).map((h) => h.code)).toEqual(['U-0050']);
    expect([...(await institutesByCode(['ROR-03kgp0001'])).values()].map((r) => r.code)).toEqual(['U-0050']);
    expect(await markAbsorbed(absorbed)).toBe(0);                 // nothing left to fold
  });

  it('is the same after loading the same files again', async () => {
    const before = await db.select().from(institutions);
    await storeInstitutions(buildEntries(aishe, await loadRor(), 'test files').values());
    const after = await db.select().from(institutions);
    expect(after).toHaveLength(before.length);
  });

  it('keeps the review status of an entry when the files are loaded again', async () => {
    await db.update(institutions).set({ status: 'merged', mergedInto: 'U-0202' }).where(eq(institutions.code, 'C-1111'));
    await storeInstitutions(buildEntries(aishe, await loadRor(), 'newer files').values());
    const [row] = await db.select().from(institutions).where(eq(institutions.code, 'C-1111'));
    expect(row).toMatchObject({ status: 'merged', sourceVersion: 'newer files' });
    await db.update(institutions).set({ status: 'active', mergedInto: null }).where(eq(institutions.code, 'C-1111'));
  });
});

describe('searching', () => {
  const codes = async (q: string, opts: { excludeHome?: boolean } = {}) => (await searchInstitutes(q, opts)).map((h) => h.code);

  it('finds BIT Mesra however it is written', async () => {
    for (const q of ['BIT Mesra', 'B.I.T. Mesra', 'birla mesra', 'Birla Institute of Technology, Mesra, Ranchi', 'bit ranchi', 'BIT, Mesra']) {
      expect(await codes(q), q).toContain('U-0202');
    }
  });

  it('finds an institute by its code typed whole, and not other codes that contain those digits', async () => {
    expect(await codes('U-0202')).toEqual(['U-0202']);
    expect(await codes('u 0202')).toEqual(['U-0202']);
    expect(await codes('ror-04paris01')).toEqual(['ROR-04paris01']);
    expect(await codes('U-0202', { excludeHome: true })).not.toContain('U-0202');
  });

  it('finds an institute by its short name, and a foreign one by its name without accents', async () => {
    expect(await codes('IIT Kharagpur')).toEqual(['U-0050']);
    expect(await codes('universite de paris')).toEqual(['ROR-04paris01']);
    expect(await codes('Université de Paris')).toEqual(['ROR-04paris01']);
  });

  it('asks every word to be there, and puts Indian institutes before foreign ones', async () => {
    expect(await codes('Birla Pilani')).toEqual(['U-0391']);
    const [first, second] = await codes('institute technology');
    expect(['U-0202', 'U-0391', 'U-0050']).toContain(first);
    expect(second).toBeTruthy();
    expect(await codes('Acme Robotics')).toEqual(['ROR-05acme001']);
  });

  it('ignores % and _ typed in a search: they are punctuation, never wildcards', async () => {
    expect(await codes('%')).toEqual([]);
    expect(await codes('_')).toEqual([]);
    expect(await codes('%%%Ranchi')).toEqual(await codes('Ranchi'));
    expect(await codes('100%')).toEqual(['C-2222']);
  });

  it('shows what is needed to choose between two: city, state, country and whether it awaits review', async () => {
    const [hit] = await searchInstitutes('Ranchi Women');
    expect(hit).toEqual({ code: 'C-1111', name: 'Ranchi Women’s College'.replace('’', "'"), city: 'Ranchi', state: 'Jharkhand', country: 'India', scheme: 'aishe', pending: false });
  });

  it('leaves out BIT Mesra when asked, and merged and empty searches find nothing', async () => {
    expect(await codes('Birla', { excludeHome: true })).toEqual(['U-0391']);
    await db.update(institutions).set({ status: 'merged', mergedInto: 'U-0391' }).where(eq(institutions.code, 'C-1111'));
    expect(await codes('Ranchi Women')).toEqual([]);
    await db.update(institutions).set({ status: 'active', mergedInto: null }).where(eq(institutions.code, 'C-1111'));
    expect(await codes('')).toEqual([]);
    expect(await codes('a')).toEqual([]);
  });
});

describe('looking up by code', () => {
  it('returns each institute, and follows a merge to the entry it points to', async () => {
    await db.update(institutions).set({ status: 'merged', mergedInto: 'U-0202' }).where(eq(institutions.code, 'C-1111'));
    const found = await institutesByCode(['U-0202', 'C-1111', 'ROR-04paris01', 'U-9999', '']);
    expect([...found.keys()].sort()).toEqual(['C-1111', 'ROR-04paris01', 'U-0202']);
    expect(found.get('C-1111')!.code).toBe('U-0202');
    await db.update(institutions).set({ status: 'active', mergedInto: null }).where(eq(institutions.code, 'C-1111'));
  });
});
