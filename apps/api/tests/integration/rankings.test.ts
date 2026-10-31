import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db, closeDb } from '../helpers/db';
import { journalMetrics, journalIndexListings, journalCoverage, journalJcr } from '@/server/db/schema';
import { rankingFor, rankingsFor, rankingItemOf, derivedValues } from '@/server/journals/ranking';
import { applyLookup } from '@/server/lookup/apply';
import { identityOfName } from '@/server/lookup/identity';
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
    const { workbook } = await generateWorkbookFromRows('faculty', { includePii: false }, {
      publications: [
        { data: { ...paper, doi: '10.5555/a', title: 'T' }, ownerName: 'Dr X', department: 'CSE', profile: {} },
        { data: { issn: '9999-0005', year: '2024', doi: '10.5555/b', title: 'U' }, ownerName: 'Dr X', department: 'CSE', profile: {} },
      ],
    });
    const sheet = workbook.getWorksheet('Publications')!;
    // The headings row: row 1 of a sheet DARP builds, lower down in IQAC's format file.
    let at = 1;
    sheet.eachRow((row, n) => { if ((row.values as unknown[]).map(String).includes('Indexing') && at === 1) at = n; });
    const header = (sheet.getRow(at).values as unknown[]).map(String);
    const col = (name: string) => header.indexOf(name);
    expect(sheet.getRow(at + 1).getCell(col('Indexing')).text).toBe('SCIE, Scopus');
    expect(sheet.getRow(at + 1).getCell(col('Impact Factor (WoS)')).text).toBe('5.2 (JIF 2024)');
    expect(sheet.getRow(at + 2).getCell(col('Indexing')).text).toBe('NA');
    expect(sheet.getRow(at + 2).getCell(col('JIF quartile (WoS)')).text).toBe('NA');
  });
});

describe('a quartile or Impact Factor the owner typed', () => {
  const paper = { issn: '9999-0001', year: '2024' };
  const of = (extra: Record<string, unknown>) => derivedValues(MODULES.publications!, [{ key: 'p', data: { ...paper, ...extra } }]).then((m) => m.get('p')!);

  it('wins over the lists, and says so', async () => {
    expect(await of({ manualSjrQuartile: 'Q3', manualJifQuartile: 'Q4', manualJif: '1.5' })).toEqual({
      indexes: 'SCIE, Scopus',
      sjrQuartile: 'Q3 (typed)',
      jif: '1.5 (typed)',
      jifQuartile: 'Q4 (typed)',
      ranking: 'Q3 SJR (typed) · IF 1.5 (typed)',
    });
  });

  it('leaves the lists alone for anything left empty', async () => {
    const r = await of({ manualSjrQuartile: 'Q3' });
    expect(r.sjrQuartile).toBe('Q3 (typed)');
    expect(r.jif).toBe('5.2 (JIF 2024)');
  });

  it('takes NA as an answer: the figure does not apply', async () => {
    const r = await of({ manualSjrQuartile: 'NA', manualJif: 'NA' });
    expect(r).toMatchObject({ sjrQuartile: 'NA (typed)', jif: 'NA (typed)', jifQuartile: 'Q2 (JIF 2024)' });
  });

  it('works for a journal with no ISSN or in no list at all', async () => {
    const none = await derivedValues(MODULES.publications!, [{ key: 'p', data: { year: '2024', manualSjrQuartile: 'Q2', manualJif: '3.1' } }]);
    expect(none.get('p')).toMatchObject({ sjrQuartile: 'Q2 (typed)', jif: '3.1 (typed)', jifQuartile: 'NA' });
    const unlisted = await derivedValues(MODULES.publications!, [{ key: 'p', data: { issn: '9999-0005', year: '2024', manualJifQuartile: 'Q1' } }]);
    expect(unlisted.get('p')).toMatchObject({ jifQuartile: 'Q1 (typed)', sjrQuartile: 'NA' });
  });

  it('reaches the counters and filters, which read rankings from the same function', async () => {
    const ranks = await rankingsFor([
      rankingItemOf('typed-q1', { issn: '9999-0003', year: '2021', manualSjrQuartile: 'Q1' }),     // the list says Q3
      rankingItemOf('typed-na', { ...paper, manualSjrQuartile: 'NA', manualJifQuartile: 'NA' }),   // the lists say Q1 and Q2
    ]);
    expect(ranks.get('typed-q1')!.sjrQuartile).toBe('Q1');
    expect(ranks.get('typed-na')).toMatchObject({ sjrQuartile: null, jifQuartile: null });
  });

  it('is a point to check for DRIE and IQAC only where it differs from the lists', async () => {
    const owner = identityOfName('Dr X');
    const base = { ...paper, title: 'T', authors: 'X', journal: 'J' };
    const differs = await applyLookup(MODULES.publications!, { ...base, manualSjrQuartile: 'Q3', manualJif: '9.9' }, { owner });
    expect(differs.verification!.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('typed Quartile (SJR) Q3; the journal lists say Q1'),
      expect.stringContaining('typed Impact Factor 9.9; the journal lists say 5.2'),
    ]));
    const agrees = await applyLookup(MODULES.publications!, { ...base, manualSjrQuartile: 'Q1', manualJif: '5.2' }, { owner });
    expect(agrees.verification!.reasons.join(' ')).not.toContain('The author typed');
  });
});
