import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray, or, eq } from 'drizzle-orm';
import { db, closeDb } from '../helpers/db';
import { journalMetrics, journalIndexListings, journalJcr, journalJcrTitles } from '@/server/db/schema';
import { matchJcr, storeJcrPdf } from '@/server/lookup/jcrImport';
import { storeJcrRows, clearJournalList } from '@/server/lookup/journals';
import { rankingFor, rankingsFor, rankingItemOf, derivedValues } from '@/server/journals/ranking';
import { applyLookup } from '@/server/lookup/apply';
import { identityOfName } from '@/server/lookup/identity';
import { generateWorkbookFromRows } from '@/server/export/excel';
import { COUNTERS } from '@/server/rollups/counters';
import { MODULES } from '@darp/shared/modules';
import type { JcrPdf } from '@/server/lookup/jcrPdf';

/*
 * Phase 1 of the visual-insights plan: the JCR list as a PDF has no ISSNs, so its journals are matched by
 * name; loading a year replaces it; and every figure follows at once. Made-up names, ISSNs and years
 * (2097, 2098) keep these rows apart from the real lists the test database may hold.
 */
const ISSNS = ['99980001', '99980002', '99980003', '99980004', '99980005', '99980006', '99980007', '99980008', '99980009'];
const YEARS = [2097, 2098];

/** Only the Journal Citation Reports rows of the test years: the ISSN fixtures stay. */
async function cleanJcr() {
  await db.delete(journalJcr).where(or(...YEARS.map((y) => eq(journalJcr.jifYear, y)))!);
  await db.delete(journalJcrTitles).where(or(...YEARS.map((y) => eq(journalJcrTitles.jifYear, y)))!);
}
async function clean() {
  await db.delete(journalMetrics).where(inArray(journalMetrics.issn, ISSNS));
  await db.delete(journalIndexListings).where(inArray(journalIndexListings.issn, ISSNS));
  await cleanJcr();
}
const pdf = (jifYear: number, journals: JcrPdf['journals']): JcrPdf => ({ jifYear, rows: journals.length, journals });
const metric = (issn: string, title: string) => ({ issn, year: 2024, title, sourceType: 'journal', quartile: 'Q2', source: 'scimago' });

beforeAll(async () => {
  await clean();
  await db.insert(journalIndexListings).values([
    { issn: '99980001', listName: 'SCIE', year: 2026, title: 'Zzyzx Alpha Journal' },
    { issn: '99980002', listName: 'SCIE', year: 2026, title: 'Zzyzx Alpha Journal' },
    { issn: '99980007', listName: 'SCIE', year: 2026, title: 'Zzyzx Epsilon' },
  ]);
  await db.insert(journalMetrics).values([
    metric('99980003', 'Zzyzx Beta Letters'),
    metric('99980004', 'Zzyzx Gamma'), metric('99980005', 'Zzyzx Gamma'), metric('99980006', 'Zzyzx Gamma'),
    metric('99980008', 'Zzyzx Epsilon'),
  ]);
});
afterAll(async () => { await clean(); await closeDb(); });

describe('matching the journals of the PDF to ISSNs', () => {
  const journals: JcrPdf['journals'] = [
    { name: 'ZZYZX ALPHA JOURNAL', jif: '5.2', quartile: 'Q2' },        // a Web of Science title, in capitals
    { name: 'Zzyzx Beta Letters', jif: '<0.1', quartile: 'Q4' },        // a SJR title with one ISSN
    { name: 'Zzyzx Gamma', jif: '1.0', quartile: 'Q3' },               // three ISSNs share the name
    { name: 'Zzyzx Delta', jif: null, quartile: null },                // nowhere
    { name: 'Zzyzx Epsilon', jif: '2.0', quartile: 'Q1' },             // in a Web of Science list and in SJR
  ];

  it('gives a Web of Science title all its ISSNs, and a Scopus or SJR title its one or two', async () => {
    const { issnRows } = await matchJcr(pdf(2098, journals));
    const mine = issnRows.filter((r) => ISSNS.includes(r.issn)).map((r) => r.issn).sort();
    expect(mine).toEqual(['99980001', '99980002', '99980003', '99980007']);
  });

  it('prefers the Web of Science title when both lists have the name', async () => {
    const { issnRows } = await matchJcr(pdf(2098, journals));
    expect(issnRows.map((r) => r.issn)).toContain('99980007');
    expect(issnRows.map((r) => r.issn)).not.toContain('99980008');
  });

  it('does not choose among more than two ISSNs, and keeps a journal found nowhere by its name', async () => {
    const { report } = await matchJcr(pdf(2098, journals));
    expect(report.nameOnly).toEqual(expect.arrayContaining(['Zzyzx Gamma', 'Zzyzx Delta']));
    expect(report.ambiguous).toBeGreaterThanOrEqual(1);
    expect(report.byWos).toBeGreaterThanOrEqual(2);
    expect(report.byOther).toBeGreaterThanOrEqual(1);
  });

  it('writes nothing', async () => {
    await matchJcr(pdf(2098, journals));
    expect(await db.select().from(journalJcrTitles).where(eq(journalJcrTitles.jifYear, 2098))).toHaveLength(0);
  });
});

describe('loading a year, and loading it again', () => {
  const paper = { issn: '9998-0001', year: '2024' };
  const first: JcrPdf['journals'] = [
    { name: 'ZZYZX ALPHA JOURNAL', jif: '5.2', quartile: 'Q2' },
    { name: 'Zzyzx Beta Letters', jif: '0.5', quartile: 'Q4' },
    { name: 'Zzyzx Gamma', jif: '1.0', quartile: 'Q3' },
  ];
  const q1q2 = COUNTERS.find((c) => c.key === 'publications.count.q1q2.sinceJoining')!;

  it('gives the papers their Impact Factor and quartile at once, by ISSN', async () => {
    await storeJcrPdf(pdf(2098, first));
    const r = await rankingFor(['9998-0001'], 2024);
    expect(r).toMatchObject({ jif: '5.2', jifQuartile: 'Q2', jifYear: 2098 });
    expect(r.jifByName).toBeUndefined();
    expect(q1q2.ranking!(r)).toBe(true);
    const cols = (await derivedValues(MODULES.publications!, [{ key: 'p', data: paper }])).get('p')!;
    expect(cols).toMatchObject({ jif: '5.2 (JIF 2098)', jifQuartile: 'Q2 (JIF 2098)' });
  });

  it('shows in the reports as soon as it is loaded', async () => {
    const { workbook } = await generateWorkbookFromRows('faculty', { includePii: false }, {
      publications: [{ data: { ...paper, doi: '10.5555/z', title: 'T' }, ownerName: 'Dr X', department: 'CSE', profile: {} }],
    });
    const sheet = workbook.getWorksheet('Publications')!;
    const text: string[] = [];
    sheet.eachRow((row) => row.eachCell((c) => text.push(c.text)));
    expect(text).toContain('5.2 (JIF 2098)');
  });

  it('REPLACES the year: a corrected quartile and Impact Factor change at once, and a dropped journal goes', async () => {
    await storeJcrPdf(pdf(2098, [{ name: 'ZZYZX ALPHA JOURNAL', jif: '4.0', quartile: 'Q3' }]));       // Q2 corrected to Q3; Beta and Gamma dropped
    const r = await rankingFor(['9998-0001'], 2024);
    expect(r).toMatchObject({ jif: '4.0', jifQuartile: 'Q3' });
    expect(q1q2.ranking!(r)).toBe(false);                                                             // no longer a Q1 or Q2 paper
    expect(await rankingFor(['9998-0003'], 2024, 'Zzyzx Beta Letters')).toMatchObject({ jif: null, jifQuartile: null });
    expect(await rankingFor([], 2024, 'Zzyzx Gamma')).toMatchObject({ jif: null });
  });

  it('removes a figure the corrected list no longer has', async () => {
    await storeJcrPdf(pdf(2098, [{ name: 'ZZYZX ALPHA JOURNAL', jif: null, quartile: null }]));
    expect(await rankingFor(['9998-0001'], 2024)).toMatchObject({ jif: null, jifQuartile: null });
  });

  it('a CSV upload that replaces the year does the same', async () => {
    await storeJcrPdf(pdf(2098, [{ name: 'ZZYZX ALPHA JOURNAL', jif: '4.0', quartile: 'Q3' }]));
    await clearJournalList('jcr', 2098);                                    // what "replace" does before the first batch
    await storeJcrRows(2098, [{ issn: '99980001', title: 'Zzyzx Alpha Journal', jif: '3.0', jifQuartile: 'Q4', categories: 'X', editions: 'SCIE' }]);
    expect(await rankingFor(['9998-0001'], 2024)).toMatchObject({ jif: '3.0', jifQuartile: 'Q4' });
  });

  it('why a CSV upload must replace: loaded twice without it, the better quartile and old Impact Factor stay', async () => {
    await cleanJcr();
    const row = (jif: string | null, jifQuartile: string | null) => ({ issn: '99980001', title: 'Zzyzx Alpha Journal', jif, jifQuartile, categories: 'X', editions: 'SCIE' });
    await storeJcrRows(2098, [row('5.2', 'Q2')]);
    await storeJcrRows(2098, [row(null, 'Q3')]);                            // IQAC corrects the file and loads it again
    expect(await rankingFor(['9998-0001'], 2024)).toMatchObject({ jif: '5.2', jifQuartile: 'Q2' });     // merged: the correction did not take
    await clearJournalList('jcr', 2098);                                    // so the first batch of a file replaces the year
    await storeJcrRows(2098, [row(null, 'Q3')]);
    expect(await rankingFor(['9998-0001'], 2024)).toMatchObject({ jif: null, jifQuartile: 'Q3' });
  });

  it('uses an older year for a journal the newest year lacks, and says which year', async () => {
    await cleanJcr();
    await storeJcrPdf(pdf(2097, [{ name: 'Zzyzx Beta Letters', jif: '0.5', quartile: 'Q4' }]));
    await storeJcrPdf(pdf(2098, [{ name: 'ZZYZX ALPHA JOURNAL', jif: '5.2', quartile: 'Q2' }]));
    expect(await rankingFor(['9998-0003'], 2024)).toMatchObject({ jif: '0.5', jifQuartile: 'Q4', jifYear: 2097 });
    expect(await rankingFor(['9998-0001'], 2024)).toMatchObject({ jif: '5.2', jifYear: 2098 });
    await clearJournalList('jcr', 2098);
    expect(await rankingFor(['9998-0001'], 2024)).toMatchObject({ jif: null });                       // clearing a year removes its figures
  });
});

describe('finding the Impact Factor by the journal’s name', () => {
  beforeAll(async () => {
    await cleanJcr();
    await storeJcrPdf(pdf(2098, [
      { name: 'ZZYZX ALPHA JOURNAL', jif: '5.2', quartile: 'Q2' },
      { name: 'Zzyzx Gamma', jif: '1.0', quartile: 'Q3' },
      { name: 'Zzyzx Delta', jif: '2.5', quartile: 'Q2' },
    ]));
  });

  it('finds a paper with no ISSN, or a wrong one, and flags it as found by name', async () => {
    for (const issns of [[], ['9998-9999']]) {
      const r = await rankingFor(issns, 2024, 'Zzyzx Delta');
      expect(r).toMatchObject({ jif: '2.5', jifQuartile: 'Q2', jifYear: 2098, jifByName: true });
    }
  });

  it('never gives an index or an SJR quartile by name, only the Impact Factor', async () => {
    const r = await rankingFor([], 2024, 'ZZYZX ALPHA JOURNAL');
    expect(r.indexes).toEqual([]);
    expect(r.sjrQuartile).toBeNull();
  });

  it('prefers the ISSN: the name is used only when no ISSN found the journal', async () => {
    const r = await rankingFor(['9998-0001'], 2024, 'Zzyzx Gamma');       // the ISSN is Alpha's; the name says Gamma
    expect(r).toMatchObject({ jif: '5.2' });
    expect(r.jifByName).toBeUndefined();
  });

  it('is found through the same function the counters, lists and filters use', async () => {
    const ranks = await rankingsFor([rankingItemOf('p', { journal: 'Zzyzx Delta', year: '2024' })]);
    expect(ranks.get('p')).toMatchObject({ jif: '2.5', jifByName: true });
  });

  it('finds nothing for a journal the list does not have, or for no name at all', async () => {
    expect(await rankingFor([], 2024, 'Zzyzx Unheard Of')).toMatchObject({ jif: null });
    expect(await rankingFor(['9998-9999'], 2024, '')).toMatchObject({ jif: null });
  });
});

describe('a figure the author typed', () => {
  const owner = identityOfName('Dr X');
  const base = { title: 'T', authors: 'X', journal: 'J', year: '2024' };

  beforeAll(async () => {
    await cleanJcr();
    await storeJcrPdf(pdf(2098, [{ name: 'ZZYZX ALPHA JOURNAL', jif: '5.2', quartile: 'Q2' }]));
  });

  it('wins over a fetched figure, and stays a point to check', async () => {
    const d = await derivedValues(MODULES.publications!, [{ key: 'p', data: { ...base, issn: '9998-0001', manualJifQuartile: 'Q4', manualJif: '1.5' } }]);
    expect(d.get('p')).toMatchObject({ jifQuartile: 'Q4 (typed)', jif: '1.5 (typed)' });
    const applied = await applyLookup(MODULES.publications!, { ...base, issn: '9998-0001', manualJifQuartile: 'Q4' }, { owner });
    expect(applied.verification!.reasons.join(' ')).toContain('typed JIF quartile Q4; the journal lists say Q2');
  });

  it('is asked for and shown when the lists have nothing, with its own point to check', async () => {
    const d = await derivedValues(MODULES.publications!, [{ key: 'p', data: { ...base, issn: '9998-7777', manualJif: '3.1' } }]);
    expect(d.get('p')).toMatchObject({ jif: '3.1 (typed)', jifQuartile: 'NA' });
    const applied = await applyLookup(MODULES.publications!, { ...base, issn: '9998-7777', manualJif: '3.1' }, { owner });
    expect(applied.verification!.reasons.join(' ')).toContain('typed Impact Factor 3.1; the journal lists do not have it');
  });

  it('is dropped by the list again when the figure is cleared', async () => {
    const d = await derivedValues(MODULES.publications!, [{ key: 'p', data: { ...base, issn: '9998-0001', manualJif: '' } }]);
    expect(d.get('p')).toMatchObject({ jif: '5.2 (JIF 2098)' });
  });
});
