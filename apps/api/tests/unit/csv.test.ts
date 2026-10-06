import { describe, it, expect } from 'vitest';
import { parseCsv } from '@/server/lookup/csv';

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
