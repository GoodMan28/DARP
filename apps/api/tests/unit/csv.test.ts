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

import { extractJcrRows, rankingTexts } from '@darp/shared/journals';

describe('extractJcrRows', () => {
  // As Journal Citation Reports exports it: title lines, the header, one row per journal and
  // category, then a copyright line.
  const jcr = parseCsv(
    '"Journal Data Filtered By:  Selected JCR Year: 2024 Selected Editions: SCIE,SSCI"\n'
    + '\n'
    + '"Journal name","JCR Abbreviation","Publisher","ISSN","eISSN","Category","Edition","Total Citations","2024 JIF","JIF Quartile","2024 JCI","5 Year JIF"\n'
    + '"FOOD CHEMISTRY","FOOD CHEM","ELSEVIER SCI LTD","0308-8146","1873-7072","FOOD SCIENCE & TECHNOLOGY","SCIE","150,000","9.8","Q1","2.1","9.9"\n'
    + '"FOOD CHEMISTRY","FOOD CHEM","ELSEVIER SCI LTD","0308-8146","1873-7072","CHEMISTRY, APPLIED","SCIE","150,000","9.8","Q1","2.1","9.9"\n'
    + '"ODD JOURNAL","ODD J","X","1234-5679","N/A","ECONOMICS","SSCI","100","N/A","N/A","0.1","N/A"\n'
    + '"TWO RANKS","TWO R","Y","2345-6789","","PHYSICS, APPLIED","SCIE","10","<0.1","Q4","0.1","0.2"\n'
    + '"TWO RANKS","TWO R","Y","2345-6789","","OPTICS","SCIE","10","<0.1","Q3","0.1","0.2"\n'
    + '"Copyright (c) 2025 Clarivate"\n',
  );

  it('reads the JIF year, both ISSNs, and merges a journal listed under several categories', () => {
    const r = extractJcrRows(jcr);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.jifYear).toBe(2024);
    const food = r.rows.filter((x) => x.title === 'FOOD CHEMISTRY');
    expect(food.map((x) => x.issn)).toEqual(['03088146', '18737072']);
    expect(food[0]).toMatchObject({
      jif: '9.8', jifQuartile: 'Q1', editions: 'SCIE',
      categories: 'FOOD SCIENCE & TECHNOLOGY; CHEMISTRY, APPLIED',
    });
  });

  it('keeps the best quartile, "<0.1" as printed, and N/A as nothing', () => {
    const r = extractJcrRows(jcr);
    if (!r.ok) throw new Error(r.message);
    expect(r.rows.find((x) => x.issn === '23456789')).toMatchObject({ jif: '<0.1', jifQuartile: 'Q3' });
    expect(r.rows.find((x) => x.issn === '12345679')).toMatchObject({ jif: null, jifQuartile: null });
    expect(r.journals).toBe(5);   // rows with an ISSN; the copyright line is not one
  });

  it('refuses a file that is not a JCR export', () => {
    const r = extractJcrRows(parseCsv('Journal title,ISSN,eISSN\nX,1234-5679,\n'));
    expect(r.ok).toBe(false);
  });
});

describe('rankingTexts', () => {
  it('says NA for anything not found', () => {
    expect(rankingTexts({
      indexes: [], sjrQuartile: null, sjrYear: null, sjrEstimated: false, jif: null, jifQuartile: null, jifYear: null,
    })).toEqual({ indexes: 'NA', sjrQuartile: 'NA', jif: 'NA', jifQuartile: 'NA', ranking: 'NA' });
  });

  it('names the edition of every figure', () => {
    expect(rankingTexts({
      indexes: ['SCIE', 'Scopus'], sjrQuartile: 'Q1', sjrYear: 2024, sjrEstimated: true,
      jif: '5.2', jifQuartile: 'Q2', jifYear: 2024,
    })).toEqual({
      indexes: 'SCIE, Scopus',
      sjrQuartile: 'Q1 (SJR 2024, estimated)',
      jif: '5.2 (JIF 2024)',
      jifQuartile: 'Q2 (JIF 2024)',
      ranking: 'Q1 SJR · IF 5.2',
    });
  });
});
