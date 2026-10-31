import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { extractIdentifiers } from '@/server/bulk/extract';

/* Adding many records at once: which identifiers a file holds. */

const txt = (s: string) => Buffer.from(s, 'utf8');
const ids = async (name: string, bytes: Buffer, kind: 'doi' | 'book' | 'patent' = 'doi') => {
  const r = await extractIdentifiers(name, bytes, kind, 'DOI');
  if (!r.ok) throw new Error(r.message);
  return r.ids;
};

describe('reading identifiers from a file', () => {
  it('takes one DOI per line, as a bare DOI or a link, each once', async () => {
    expect(await ids('dois.txt', txt('10.1016/j.future.2026.107812\nhttps://doi.org/10.1109/TKDE.2011.163\n\n10.1016/J.FUTURE.2026.107812\ndoi: 10.1007/978-3-031-12345-6_7.\n'))).toEqual([
      '10.1016/j.future.2026.107812', '10.1109/tkde.2011.163', '10.1007/978-3-031-12345-6_7',
    ]);
  });

  it('finds DOIs in any column of a CSV and ignores everything else', async () => {
    const csv = 'S.No,Title,DOI,Year\n1,"A paper, with a comma",10.1016/j.a.2024.1,2024\n2,Another;10.1016/j.b.2024.2;2023\n';
    expect(await ids('papers.csv', txt(csv))).toEqual(['10.1016/j.a.2024.1', '10.1016/j.b.2024.2']);
  });

  it('reads the first sheet of an Excel file, links included', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Papers');
    ws.addRow(['Title', 'DOI']);
    ws.addRow(['A', '10.1016/j.a.2024.1']);
    ws.addRow(['B', { text: 'link to the paper', hyperlink: 'https://doi.org/10.1016/j.b.2024.2' }]);
    wb.addWorksheet('Other').addRow(['10.1016/j.not.this.sheet']);
    const bytes = Buffer.from(await wb.xlsx.writeBuffer());
    expect(await ids('papers.xlsx', bytes)).toEqual(['10.1016/j.a.2024.1', '10.1016/j.b.2024.2']);
  });

  it('takes ISBNs for books, and Indian patent numbers for patents', async () => {
    expect(await ids('books.txt', txt('ISBN 978-0-306-40615-7\n0-306-40615-2\n10.1007/978-3-031-1_2\n978-0-306-40615-8\n'), 'book'))
      .toEqual(['9780306406157', '10.1007/978-3-031-1_2']);
    expect(await ids('patents.csv', txt('Application,Note\n202331060280,granted\nIN 599883\n935/kol/2013\n12AB\n2024\n'), 'patent'))
      .toEqual(['202331060280', '599883', '935/KOL/2013']);
  });

  it('refuses a file with nothing to add, more than 100, or of another type', async () => {
    expect(await extractIdentifiers('empty.txt', txt('Title\nNo DOI here\n'), 'doi', 'DOI'))
      .toMatchObject({ ok: false, message: expect.stringContaining('No DOI was found') });
    const many = Array.from({ length: 101 }, (_, i) => `10.5555/bulk-${i}`).join('\n');
    expect(await extractIdentifiers('many.txt', txt(many), 'doi', 'DOI'))
      .toMatchObject({ ok: false, message: expect.stringContaining('at most 100') });
    expect(await extractIdentifiers('a.pdf', txt('10.1016/j.a.2024.1'), 'doi', 'DOI'))
      .toMatchObject({ ok: false, message: 'Upload a .txt, .csv or .xlsx file.' });
    expect(await extractIdentifiers('fake.xlsx', txt('10.1016/j.a.2024.1'), 'doi', 'DOI'))
      .toMatchObject({ ok: false, message: expect.stringContaining('not an Excel') });
  });
});
