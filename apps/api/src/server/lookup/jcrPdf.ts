import { pdfPages } from './patentPdf';
import type { TextItem } from './patentJournal';
import { ServiceError } from '@/server/records/service';

/*
 * The Journal Citation Reports list as the library prints it to PDF: Journal Name, JIF <year>, 5-Year and Q,
 * one line per journal per category. The PDF has no ISSN and no category, only the name, so the journals are
 * matched to ISSNs afterwards (jcrImport.ts). The columns are read by their place on the page.
 */

export interface JcrPdfRow { name: string; jif: string | null; quartile: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null }
export interface JcrPdf {
  /** The year in the "JIF 2024" heading: the figures are for that year. */
  jifYear: number;
  /** Lines read, with a journal that is in several categories counted once for each. */
  rows: number;
  journals: JcrPdfRow[];
}

const NUMBER = /^(<?\d+(\.\d+)?|N\/A)$/;
const QUARTILE = /^(Q[1-4]|N\/A)$/;
/** Text left of this is the journal's name. A long name may run under the JIF column but starts at the left. */
const NAME_ENDS_AT = 370;

/**
 * A name as the database may hold it. A PDF can carry invisible control characters inside a name (one
 * journal's has a NUL byte, which PostgreSQL refuses), so they become spaces, and spaces are collapsed.
 */
const invisible = (n: number) => n < 32 || (n >= 127 && n <= 159) || (n >= 0x200b && n <= 0x200f) || n === 0x2028 || n === 0x2029 || n === 0xfeff;
export const cleanName = (s: string): string => [...s].map((c) => (invisible(c.charCodeAt(0)) ? ' ' : c)).join('').replace(/\s+/g, ' ').trim();

/**
 * The journals on some pages of text. A journal in several categories repeats with the same figures, so
 * it is kept once. Throws when the pages are not laid out like the Journal Citation Reports list.
 */
export function linesToRows(pages: TextItem[][]): JcrPdf {
  let jifYear = 0;
  let rows = 0;
  let odd = 0;
  const seen = new Map<string, JcrPdfRow>();
  for (const items of pages) {
    const lines = new Map<number, TextItem[]>();
    for (const it of items) {
      const y = Math.round(it.y);
      const line = lines.get(y);
      if (line) line.push(it); else lines.set(y, [it]);
    }
    for (const line of lines.values()) {
      const all = line.map((i) => i.s.trim()).join(' ');
      if (/Journal\s*Name/.test(all)) {
        if (!jifYear) jifYear = Number(/JIF\s*((?:19|20)\d{2})/.exec(all)?.[1] ?? 0);
        continue;
      }
      const sorted = [...line].sort((a, b) => a.x - b.x);
      const name = cleanName(sorted.filter((i) => i.x < NAME_ENDS_AT).map((i) => i.s).join(' '));
      const rest = sorted.filter((i) => i.x >= NAME_ENDS_AT).map((i) => i.s.trim());
      if (name && rest.length === 3 && NUMBER.test(rest[0]!) && NUMBER.test(rest[1]!) && QUARTILE.test(rest[2]!)) {
        rows += 1;
        seen.set(name, {
          name,
          jif: rest[0] === 'N/A' ? null : rest[0]!,
          quartile: rest[2] === 'N/A' ? null : (rest[2] as JcrPdfRow['quartile']),
        });
      } else {
        odd += 1;
      }
    }
  }
  if (jifYear === 0 || seen.size < 1000 || odd > rows / 100) {
    throw new ServiceError('VALIDATION', 'This does not look like the Journal Citation Reports list: expected Journal Name, JIF, 5-Year and Q columns.');
  }
  return { jifYear, rows, journals: [...seen.values()] };
}

/** Reads the PDF page by page (the list runs to some 600 pages) and returns its journals. */
export async function readJcrPdf(bytes: Uint8Array): Promise<JcrPdf> {
  const pages: TextItem[][] = [];
  for await (const items of pdfPages(bytes)) pages.push(items);
  return linesToRows(pages);
}
