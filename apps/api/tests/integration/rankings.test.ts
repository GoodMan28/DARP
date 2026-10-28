import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db, closeDb } from '../helpers/db';
import { journalMetrics, journalIndexListings, journalCoverage, journalJcr } from '@/server/db/schema';
import { rankingFor, derivedValues } from '@/server/journals/ranking';
import { storeJcrRows } from '@/server/lookup/journals';
import { generateWorkbookFromRows } from '@/server/export/excel';
import { MODULES } from '@darp/shared/modules';

/*
 * A paper's indexing, quartile and Impact Factor are worked out from its ISSN and the newest lists
 * loaded (decisions D1–D4 of the refinements plan). Made-up ISSNs keep these rows apart from the
 * real Scopus and SCImago lists the test database holds, and are removed afterwards.
 */
const A_PRINT = '99990001';
const A_ONLINE = '99990002';
const DROPPED = '99990003';
const MERGED = '99990004';
const OURS = [A_PRINT, A_ONLINE, DROPPED, MERGED];

async function clean() {
  await db.delete(journalMetrics).where(inArray(journalMetrics.issn, OURS));
  await db.delete(journalIndexListings).where(inArray(journalIndexListings.issn, OURS));
  await db.delete(journalCoverage).where(inArray(journalCoverage.issn, OURS));
  await db.delete(journalJcr).where(inArray(journalJcr.issn, OURS));
}

beforeAll(async () => {
  await clean();
  // Journal A: in Scopus since 2010 and in SCIE; SJR 2023 Q2 (SCImago), SJR 2024 Q1 (estimated); JIF 2024 5.2, Q2.
  await db.insert(journalMetrics).values([
    { issn: A_PRINT, year: 2023, title: 'A', sourceType: 'journal', quartile: 'Q2', source: 'scimago' },
    { issn: A_PRINT, year: 2024, title: 'A', sourceType: 'journal', quartile: 'Q1', source: 'scopus-list' },
    // Dropped by Scopus after 2022: its last SJR was 2021.
    { issn: DROPPED, year: 2021, title: 'Dropped', sourceType: 'journal', quartile: 'Q3', source: 'scimago' },
  ]);
  await db.insert(journalCoverage).values([
    { issn: A_PRINT, source: 'scopus-list', fromYear: 2010, toYear: null },
    { issn: DROPPED, source: 'scopus-discontinued', fromYear: 0, toYear: 2022 },
  ]);
  // The Master Journal List names both ISSNs of a journal.
  await db.insert(journalIndexListings).values([
    { issn: A_PRINT, listName: 'SCIE', year: 2026, title: 'A' },
    { issn: A_ONLINE, listName: 'SCIE', year: 2026, title: 'A' },
  ]);
  await storeJcrRows(2024, [
    { issn: A_PRINT, title: 'A', jif: '5.2', jifQuartile: 'Q2', categories: 'X', editions: 'SCIE' },
    { issn: A_ONLINE, title: 'A', jif: '5.2', jifQuartile: 'Q2', categories: 'X', editions: 'SCIE' },
  ]);
});

afterAll(async () => {
  await clean();
  await closeDb();
});

describe('a journal\x27s ranking, worked out from its ISSN', () => {
  it('gives every index, the newest SJR quartile and the newest Impact Factor', async () => {
    const r = await rankingFor(['9999-0001'], 2024);
    expect(r.indexes).toEqual(['SCIE', 'Scopus']);          // in IQAC's Indexing order
    expect(r).toMatchObject({ sjrQuartile: 'Q1', sjrYear: 2024, sjrEstimated: true });
    expect(r).toMatchObject({ jif: '5.2', jifQuartile: 'Q2', jifYear: 2024 });
  });

  it('finds the journal from its online ISSN alone', async () => {
    const r = await rankingFor(['9999-0002'], 2024);
    expect(r.indexes).toContain('SCIE');
    expect(r.jif).toBe('5.2');
  });

  it('uses the newest edition even for an older paper', async () => {
    expect((await rankingFor(['9999-0001'], 2015)).sjrQuartile).toBe('Q1');
  });

  it('counts Scopus only in the years Scopus covered the journal', async () => {
    const late = await rankingFor(['9999-0003'], 2024);
    expect(late.indexes).toEqual([]);
    expect(late.sjrQuartile).toBeNull();
    const early = await rankingFor(['9999-0003'], 2021);
    expect(early.indexes).toEqual(['Scopus']);
    expect(early).toMatchObject({ sjrQuartile: 'Q3', sjrYear: 2021, sjrEstimated: false });
  });

  it('says nothing about a journal in no list', async () => {
    expect(await rankingFor(['9999-0005'], 2024)).toEqual({
      indexes: [], sjrQuartile: null, sjrYear: null, sjrEstimated: false, jif: null, jifQuartile: null, jifYear: null,
    });
  });

  it('keeps a journal\x27s best quartile across several JCR exports', async () => {
    await storeJcrRows(2024, [{ issn: MERGED, title: 'M', jif: null, jifQuartile: 'Q3', categories: 'OPTICS', editions: 'SCIE' }]);
    await storeJcrRows(2024, [{ issn: MERGED, title: 'M', jif: '1.1', jifQuartile: 'Q1', categories: 'PHYSICS', editions: 'SCIE' }]);
    await storeJcrRows(2024, [{ issn: MERGED, title: 'M', jif: null, jifQuartile: 'Q4', categories: 'OPTICS', editions: 'SCIE' }]);
    const [row] = await db.select().from(journalJcr).where(inArray(journalJcr.issn, [MERGED]));
    expect(row).toMatchObject({ jif: '1.1', jifQuartile: 'Q1', categories: 'OPTICS; PHYSICS', editions: 'SCIE' });
  });
});

describe('where the ranking is shown', () => {
  const paper = { issn: '9999-0001', year: '2024' };

  it('fills the derived columns of a Publications row', async () => {
    const out = await derivedValues(MODULES.publications!, [{ key: 'p', data: paper }]);
    expect(out.get('p')).toEqual({
      indexes: 'SCIE, Scopus',
      sjrQuartile: 'Q1 (SJR 2024, estimated)',
      jif: '5.2 (JIF 2024)',
      jifQuartile: 'Q2 (JIF 2024)',
      ranking: 'Q1 SJR · IF 5.2',
    });
  });

  it('exports them, with NA for a journal in no list', async () => {
    const { workbook } = await generateWorkbookFromRows('faculty', { cycleId: 'test-cycle', includePii: false }, {
      publications: [
        { data: { ...paper, doi: '10.5555/a', title: 'T' }, ownerName: 'Dr X', department: 'CSE', profile: {} },
        { data: { issn: '9999-0005', year: '2024', doi: '10.5555/b', title: 'U' }, ownerName: 'Dr X', department: 'CSE', profile: {} },
      ],
    });
    const sheet = workbook.getWorksheet('Publications')!;
    const header = (sheet.getRow(1).values as unknown[]).map(String);
    const col = (name: string) => header.indexOf(name);
    expect(sheet.getRow(2).getCell(col('Indexing')).text).toBe('SCIE, Scopus');
    expect(sheet.getRow(2).getCell(col('Impact Factor (WoS)')).text).toBe('5.2 (JIF 2024)');
    expect(sheet.getRow(3).getCell(col('Indexing')).text).toBe('NA');
    expect(sheet.getRow(3).getCell(col('JIF quartile (WoS)')).text).toBe('NA');
  });
});
