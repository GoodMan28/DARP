import { describe, it, expect } from 'vitest';
import { pickNewestList, bestQuartiles, type ScopusJournal } from '@/server/lookup/scopusList';

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
  issns: ['00000000'], title: 't', indexed: true, sjr, asjc, sourceType: 'journal',
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
