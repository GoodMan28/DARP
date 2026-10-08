import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';   // ExcelJS's own dependency
import {
  pickNewestList, bestQuartiles, readScopusList, nightlyCheckDue, type ScopusJournal,
} from '@/server/lookup/scopusList';
import { scopusCovered } from '@/server/lookup/journals';
import { parseCoverage } from '@darp/shared/journals';

describe('pickNewestList', () => {
  it('picks the newest file whatever way its date is written', () => {
    const html = [
      'href="//downloads.ctfassets.net/a/1/x/Scopus-Title-List-202405_Public.xlsx"',
      'href="//downloads.ctfassets.net/a/2/y/Internal_Scopus_Source_Title_List_November_2024_edited.xlsx"',
      'href="//downloads.ctfassets.net/a/3/z/Scopus-Title-List202210Public.xlsx"',
      'href="https://example.org/not-a-list.pdf"',
    ].join(' ');
    const newest = pickNewestList(html);
    expect(newest?.name).toBe('Internal_Scopus_Source_Title_List_November_2024_edited.xlsx');
    expect(newest?.url.startsWith('https://downloads.ctfassets.net/')).toBe(true);
    expect([newest?.year, newest?.month]).toEqual([2024, 11]);
  });

  it('returns null when the page links no list', () => {
    expect(pickNewestList('<html>no lists here</html>')).toBeNull();
  });
});

const j = (sjr: number | null, asjc: string[]): ScopusJournal => ({
  issns: ['00000000'], title: 't', indexed: true, sjr, asjc, sourceType: 'journal', coverage: [],
});

describe('bestQuartiles', () => {
  it('ranks within a subject category: the top quarter is Q1', () => {
    const journals = [8, 7, 6, 5, 4, 3, 2, 1].map((s) => j(s, ['1700']));
    expect(bestQuartiles(journals)).toEqual(['Q1', 'Q1', 'Q2', 'Q2', 'Q3', 'Q3', 'Q4', 'Q4']);
  });

  it('gives a journal in several categories its best quartile', () => {
    // Weak in Computer Science (last of 4), strong in Engineering (first of 4).
    const journals = [
      j(1, ['1700', '2200']),
      j(9, ['1700']), j(8, ['1700']), j(7, ['1700']),
      j(0.5, ['2200']), j(0.4, ['2200']), j(0.3, ['2200']),
    ];
    expect(bestQuartiles(journals)[0]).toBe('Q1');
  });

  it('leaves journals without an SJR value unranked', () => {
    expect(bestQuartiles([j(null, ['1700']), j(0, ['1700']), j(2, ['1700'])])).toEqual([null, null, 'Q1']);
  });
});

describe('parseCoverage', () => {
  it('reads every way Elsevier and SCImago write the years', () => {
    expect(parseCoverage('2019-2023; 2016-2017')).toEqual([{ from: 2016, to: 2017 }, { from: 2019, to: 2023 }]);
    expect(parseCoverage('2014-ongoing, 2012')).toEqual([{ from: 2012, to: 2012 }, { from: 2014, to: null }]);
    expect(parseCoverage('1996-2001, 2003-2026')).toEqual([{ from: 1996, to: 2001 }, { from: 2003, to: 2026 }]);
    expect(parseCoverage('')).toEqual([]);
    expect(parseCoverage('n/a')).toEqual([]);
  });
});

describe('scopusCovered', () => {
  const list = (from: number, to: number | null) => ({ source: 'scopus-list', fromYear: from, toYear: to });
  const dropped = (final: number) => ({ source: 'scopus-discontinued', fromYear: 0, toYear: final });

  it('is unknown when nothing is loaded for the journal', () => {
    expect(scopusCovered([], 2023)).toEqual({ covered: 'unknown', flag: null });
  });

  it('covers a year inside a range, and an active title from its start onwards', () => {
    expect(scopusCovered([list(2009, null)], 2024).covered).toBe(true);
    expect(scopusCovered([list(2016, 2017), list(2019, null)], 2016).covered).toBe(true);
  });

  it('does not cover a year before Scopus started, or in a gap', () => {
    expect(scopusCovered([list(2016, 2017), list(2019, null)], 2018))
      .toEqual({ covered: false, flag: 'scopus-not-that-year:2016–2017 and 2019 onwards' });
    expect(scopusCovered([list(2023, null)], 2021).covered).toBe(false);
  });

  it('does not cover a paper after the year Scopus dropped the journal (Scientific Programming)', () => {
    const rows = [list(2009, null), dropped(2023)];   // a stale "ongoing" range is overruled
    expect(scopusCovered(rows, 2024)).toEqual({ covered: false, flag: 'scopus-dropped:2023' });
    expect(scopusCovered(rows, 2023).covered).toBe(true);
    expect(scopusCovered([dropped(2023)], 2022).covered).toBe(true);
  });
});

describe('nightlyCheckDue', () => {
  // 02:30 in India is 21:00 UTC the day before.
  const at230ist = new Date('2026-10-07T21:00:00Z');

  it('runs once at 2 AM India time', () => {
    expect(nightlyCheckDue(at230ist, undefined)).toBe(true);
    expect(nightlyCheckDue(at230ist, '2026-10-06T21:00:00Z')).toBe(true);    // last ran the night before
    expect(nightlyCheckDue(at230ist, '2026-10-07T20:35:00Z')).toBe(false);   // already ran tonight
  });

  it('does not run at other hours', () => {
    expect(nightlyCheckDue(new Date('2026-10-08T06:30:00Z'), undefined)).toBe(false);   // noon in India
  });
});

describe('readScopusList', () => {
  async function workbook(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Overview').addRow(['Status of Scopus titles']);
    const main = wb.addWorksheet('Scopus Active');
    main.addRow(['Sourcerecord ID', 'Source Title', 'ISSN', 'EISSN', 'Active', 'Coverage',
      'Titles discontinued by Scopus due to quality issues', '2023 SJR', 'Source Type',
      'All Science Journal Classification Codes']);
    main.addRow(['1', 'Evolutionary Intelligence', '1864-5909', '1864-5917', 'Active', '2008-2024', '', '0.638', 'Journal', '1702; 2601']);
    main.addRow(['2', 'Scientific Programming', '1058-9244', '1875-919X', 'Active', '1996-2023', 'Discontinued', '0.4', 'Journal', '1712']);
    const dropped = wb.addWorksheet('Discontinued titles');
    dropped.addRow(['Status (recently discontinued titles)', '', '', '', '', '', 'FINAL COVERAGE']);
    dropped.addRow(['Sourcerecord ID', 'Source Title', 'ISSN', 'EISSN', 'Publisher', 'Reason for re-evaluation', 'Year']);
    dropped.addRow(['2', 'Scientific Programming', '10589244', '', 'Hindawi', 'Publication concerns', '2023']);
    // ExcelJS writes workbook.xml last; Elsevier's files (and the streaming reader) have it first.
    const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer());
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir);
    const rank = (n: string) => (n === 'xl/workbook.xml' ? 0 : n.includes('sharedStrings') ? 1 : n.includes('worksheets/') ? 3 : 2);
    const ordered = new JSZip();
    for (const n of names.sort((a, b) => rank(a) - rank(b))) ordered.file(n, await zip.files[n]!.async('uint8array'));
    return ordered.generateAsync({ type: 'nodebuffer' });
  }

  it('reads the coverage years and the titles Scopus dropped', async () => {
    const { journals, dropped, sjrYear } = await readScopusList(await workbook());
    expect(sjrYear).toBe(2023);
    expect(journals[0]).toMatchObject({ indexed: true, coverage: [{ from: 2008, to: null }] });   // still covered
    expect(journals[1]).toMatchObject({ indexed: false, coverage: [{ from: 1996, to: 2023 }] });
    expect(dropped).toEqual([{ issns: ['10589244'], finalYear: 2023 }]);
  });
});
