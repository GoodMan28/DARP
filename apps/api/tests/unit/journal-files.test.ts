import { describe, it, expect } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { detectJournalFile, extractListRows, parseCsv } from '@darp/shared/journals';
import { readXlsx } from '@darp/shared/sheets';

/* The upload box on Administration → Journal & patent data: which file is which, and Excel files. */

const LISTS = ['SCIE', 'Scopus', 'ESCI', 'SSCI', 'AHCI'];
const MJL = parseCsv('"Journal title","ISSN","eISSN","Publisher name","Web of Science Categories"\n"2D MATERIALS","2053-1583","2053-1583","IOP","Physics"\n');
const io = { inflateRaw: async (d: Uint8Array) => new Uint8Array(inflateRawSync(d)), utf8: (d: Uint8Array) => Buffer.from(d).toString('utf8') };

describe('which journal file is which', () => {
  it('names a Web of Science list from Clarivate’s file name', () => {
    expect(detectJournalFile('Science Citation Index Expanded (SCIE).csv', MJL, LISTS)).toEqual({ kind: 'list', listName: 'SCIE' });
    expect(detectJournalFile('Social Sciences Citation Index (SSCI).csv', MJL, LISTS)).toEqual({ kind: 'list', listName: 'SSCI' });
    expect(detectJournalFile('Arts & Humanities Citation Index (AHCI).csv', MJL, LISTS)).toEqual({ kind: 'list', listName: 'AHCI' });
    expect(detectJournalFile('Emerging Sources Citation Index (ESCI).xlsx', MJL, LISTS)).toEqual({ kind: 'list', listName: 'ESCI' });
    expect(detectJournalFile('ssci-2026.csv', MJL, LISTS)).toEqual({ kind: 'list', listName: 'SSCI' });
  });

  it('asks when the file name does not say, and never guesses Scopus', () => {
    expect(detectJournalFile('download (3).csv', MJL, LISTS)).toEqual({ kind: 'list', listName: null });
    expect(detectJournalFile('scopus.csv', MJL, LISTS)).toEqual({ kind: 'list', listName: null });
    // A collection the Indexing list does not have is not offered.
    expect(detectJournalFile('SCIE.csv', MJL, ['Scopus'])).toEqual({ kind: 'list', listName: null });
  });

  it('knows SCImago’s file and its year', () => {
    const sjr = parseCsv('Rank;Sourceid;Title;Type;Issn;SJR;SJR Best Quartile;Total Docs. (2025)\n1;1;"A";journal;"15424863";1;Q1;48\n');
    expect(detectJournalFile('scimagojr 2025.csv', sjr, LISTS)).toEqual({ kind: 'sjr', year: 2025 });
    expect(detectJournalFile('download.csv', sjr, LISTS)).toEqual({ kind: 'sjr', year: 2025 });
  });

  it('knows a Journal Citation Reports export, title lines and all', () => {
    const jcr = parseCsv('"Journal Data Filtered By: Selected JCR Year: 2024"\nJournal name,ISSN,eISSN,Category,2024 JIF,JIF Quartile\n"A",0167-739X,,"CS",5.2,Q1\n');
    expect(detectJournalFile('JCR_export.csv', jcr, LISTS)).toEqual({ kind: 'jcr', year: 2024 });
  });

  it('says plainly when a file has no ISSNs', () => {
    const r = detectJournalFile('marks.csv', parseCsv('Name,Roll\nA,1\n'), LISTS);
    expect(r.kind).toBe('unknown');
  });
});

describe('Excel files', () => {
  async function workbook(build: (ws: ExcelJS.Worksheet) => void): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook();
    build(wb.addWorksheet('Journals'));
    wb.addWorksheet('Notes').addRow(['not this sheet']);
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  it('reads the first sheet like the CSV it came from', async () => {
    const bytes = await workbook((ws) => {
      ws.addRow(['Journal title', 'ISSN', 'eISSN', 'Web of Science Categories']);
      ws.addRow(['2D MATERIALS', '2053-1583', '2053-1583', 'Physics & Chemistry']);
      ws.addRow(['3 BIOTECH', '2190-572X', '', 'Biotechnology']);
      ws.addRow(['NUMBERS <AND> "QUOTES"', 12345679, '', '']);
    });
    const table = await readXlsx(bytes, io);
    expect(table[0]).toEqual(['Journal title', 'ISSN', 'eISSN', 'Web of Science Categories']);
    expect(table[1]).toEqual(['2D MATERIALS', '2053-1583', '2053-1583', 'Physics & Chemistry']);
    expect(table[2]?.slice(0, 2)).toEqual(['3 BIOTECH', '2190-572X']);
    expect(table[3]?.slice(0, 2)).toEqual(['NUMBERS <AND> "QUOTES"', '12345679']);
    const rows = extractListRows(table);
    expect(rows.ok && rows.rows.map((r) => r.issn)).toEqual(['20531583', '2190572X', '12345679']);
  });

  it('keeps empty cells in place', async () => {
    const bytes = await workbook((ws) => {
      ws.addRow(['A', 'B', 'C']);
      ws.getCell('A2').value = 'x';
      ws.getCell('C2').value = 'z';
    });
    expect((await readXlsx(bytes, io))[1]).toEqual(['x', '', 'z']);
  });

  it('refuses a file that is not a workbook', async () => {
    await expect(readXlsx(new TextEncoder().encode('Title,ISSN\nA,1'), io)).rejects.toThrow(/not an Excel/);
  });
});
