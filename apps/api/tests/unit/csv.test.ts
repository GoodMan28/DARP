import { describe, it, expect } from 'vitest';
import { parseCsv } from '@darp/shared/journals';

describe('parseCsv', () => {
  it('reads semicolon files with a quoted, comma-joined ISSN cell', () => {
    const rows = parseCsv('Rank;Title;Issn;SJR Best Quartile\n1;"Nature";"15424863, 00079235";Q1\n');
    expect(rows).toEqual([
      ['Rank', 'Title', 'Issn', 'SJR Best Quartile'],
      ['1', 'Nature', '15424863, 00079235', 'Q1'],
    ]);
  });

  it('reads comma files and doubled quotes', () => {
    const rows = parseCsv('Title,ISSN\n"The ""Big"" Journal",0167-739X\n');
    expect(rows[1]).toEqual(['The "Big" Journal', '0167-739X']);
  });

  it('copes with CRLF line endings and a byte-order mark', () => {
    const rows = parseCsv('﻿Title,ISSN\r\nA,1234-5678\r\nB,2345-6789\r\n');
    expect(rows).toEqual([['Title', 'ISSN'], ['A', '1234-5678'], ['B', '2345-6789']]);
  });

  it('keeps a semicolon inside a quoted cell', () => {
    const rows = parseCsv('a;b\n"x;y";z\n');
    expect(rows[1]).toEqual(['x;y', 'z']);
  });
});

import { extractSjrRows, extractListRows } from '@darp/shared/journals';

describe('extractSjrRows', () => {
  const sjr = parseCsv(
    'Rank;Sourceid;Title;Type;Issn;SJR;SJR Best Quartile\n'
    + '1;1;"IEEE Access";journal;"21693536";0,96;Q1\n'
    + '2;2;"Two ISSNs";journal;"15424863, 00079235";1,2;Q2\n'
    + '3;3;"Unranked";book series;"-";0;-\n',
  );

  it('gives one row per ISSN, with the quartile', () => {
    const r = extractSjrRows(sjr);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.journals).toBe(3);
    expect(r.rows).toEqual([
      { issn: '21693536', title: 'IEEE Access', sourceType: 'journal', quartile: 'Q1' },
      { issn: '15424863', title: 'Two ISSNs', sourceType: 'journal', quartile: 'Q2' },
      { issn: '00079235', title: 'Two ISSNs', sourceType: 'journal', quartile: 'Q2' },
    ]);
  });

  it('keeps the coverage years of a current SCImago file', () => {
    // The 2025 file adds columns (a second Publisher, %Female, Overton) and Coverage.
    const r = extractSjrRows(parseCsv(
      'Rank;Sourceid;Title;Type;Issn;Publisher;SJR;SJR Best Quartile;Publisher;Coverage;Categories\n'
      + '1;2;"IJISA";journal;"20749058, 2074904X";"MECS";0,161;Q4;"MECS";"2016-2018, 2024-2026";"Computer Science (Q4)"\n',
    ));
    expect(r.ok && r.rows.map((x) => x.coverage)).toEqual(['2016-2018, 2024-2026', '2016-2018, 2024-2026']);
  });

  it('refuses a file that is not from SCImago', () => {
    const r = extractSjrRows(parseCsv('Journal title,ISSN\nX,1234-5678\n'));
    expect(r.ok).toBe(false);
  });
});

describe('extractListRows', () => {
  it('reads every ISSN column of a Web of Science list, once per journal', () => {
    const r = extractListRows(parseCsv(
      'Journal title,ISSN,eISSN,Publisher name\n'
      + 'IEEE ACCESS,,2169-3536,IEEE\n'
      + 'SAME TWICE,1234-5679,1234-5679,X\n',
    ));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x.issn)).toEqual(['21693536', '12345679']);
  });
});
