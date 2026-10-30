import ExcelJS from 'exceljs';
import type { LookupKind } from '@darp/shared/modules/types';
import { normaliseDoiInput } from '@/server/lookup/doi';
import { isbn13 } from '@/server/lookup/isbn';
import { normalisePatentNumber } from '@/server/records/patentNumber';

/** At most this many identifiers in one file: a run takes about a second each. */
export const BULK_MAX_ITEMS = 100;
export const BULK_MAX_BYTES = 1024 * 1024;

/** A DOI anywhere in a cell, on its own or inside https://doi.org/… */
const DOI_IN_TEXT = /10\.\d{4,9}\/[^\s"'<>,;]+/gi;

export type BulkFileKind = 'txt' | 'csv' | 'xlsx';

export function bulkFileKind(fileName: string): BulkFileKind | null {
  const ext = fileName.toLowerCase().split('.').pop();
  return ext === 'txt' || ext === 'csv' || ext === 'xlsx' ? ext : null;
}

/** Every cell of a text file: one per line, split again at commas, semicolons and tabs. */
function textCells(bytes: Buffer): string[] {
  const all = bytes.toString('utf8');
  // A byte-order mark, as Excel puts at the start of a CSV saved as UTF-8.
  return (all.charCodeAt(0) === 0xfeff ? all.slice(1) : all)
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[,;\t]/))
    .map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim())
    .filter(Boolean);
}

/** Every cell of the workbook's first sheet, as the text Excel shows. */
async function workbookCells(bytes: Buffer): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    throw new Error('This is not an Excel (.xlsx) file. Save it from Excel as .xlsx or .csv and try again.');
  }
  const sheet = wb.worksheets[0];
  const out: string[] = [];
  sheet?.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      // A hyperlink cell's text is what is shown; its link may hold the DOI too.
      const link = typeof cell.value === 'object' && cell.value && 'hyperlink' in cell.value ? String(cell.value.hyperlink ?? '') : '';
      for (const t of [cell.text, link]) if (t && t.trim()) out.push(t.trim());
    });
  });
  return out;
}

/** The identifiers in one cell that fit the module: DOIs, ISBNs (books) or Indian patent numbers. */
function identifiersIn(cell: string, kind: LookupKind): string[] {
  const out: string[] = [];
  if (kind === 'doi' || kind === 'book') {
    for (const match of cell.match(DOI_IN_TEXT) ?? []) {
      const doi = normaliseDoiInput(match.replace(/[.)\]]+$/, ''));
      if (doi) out.push(doi);
    }
  }
  if (out.length > 0) return out;
  // An ISBN or a patent number fills its cell, perhaps with spaces or a label before it.
  const words = [cell, ...cell.split(/\s+/)];
  for (const w of words) {
    if (kind === 'book') {
      const isbn = isbn13(w);
      if (isbn) return [isbn];
    } else if (kind === 'patent') {
      const n = normalisePatentNumber(w, 'India');
      if ('value' in n) return [n.value];
    }
  }
  return [];
}

export type Extracted = { ok: true; ids: string[] } | { ok: false; message: string };

/**
 * The module's identifiers in an uploaded file, in the order they appear, each once. Anything else
 * (headers, titles, notes) is ignored. Refuses an empty file, a file with none, and more than 100.
 */
export async function extractIdentifiers(fileName: string, bytes: Buffer, kind: LookupKind, idLabel: string): Promise<Extracted> {
  const type = bulkFileKind(fileName);
  if (!type) return { ok: false, message: 'Upload a .txt, .csv or .xlsx file.' };
  let cells: string[];
  try {
    cells = type === 'xlsx' ? await workbookCells(bytes) : textCells(bytes);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const cell of cells) {
    for (const id of identifiersIn(cell, kind)) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  if (ids.length === 0) return { ok: false, message: `No ${idLabel} was found in this file. Put one per line, or in any column of a CSV or Excel file.` };
  if (ids.length > BULK_MAX_ITEMS) {
    return { ok: false, message: `This file has ${ids.length} different numbers; at most ${BULK_MAX_ITEMS} can be added at once. Split it into smaller files.` };
  }
  return { ok: true, ids };
}
