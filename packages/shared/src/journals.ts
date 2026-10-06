/*
 * Journal lists (SCImago SJR, Web of Science collections) — reading the downloaded CSV files.
 * Pure functions, shared by the admin upload screen (which parses the file in the browser, so a
 * 10 MB file never crosses the proxy) and the command-line import.
 */

/** One journal ISSN from a list. A journal with print and electronic ISSNs gives two rows. */
export interface JournalListRow {
  issn: string;                 // 8 characters, no hyphen, upper-case X
  title: string;
  /** SJR only: journal | book series | conference and proceedings | trade journal */
  sourceType?: string;
  /** SJR only: Q1..Q4, or null when the journal is unranked that year */
  quartile?: string | null;
}

/**
 * Minimal CSV reader (SCImago uses semicolons, Clarivate commas). Handles quoted cells,
 * doubled quotes, CRLF line endings and a leading byte-order mark.
 */
export function parseCsv(text: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;   // byte-order mark
  const head = body.split('\n', 1)[0] ?? '';
  const delim = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** '0167-739x' / '0167739X' → '0167739X'; anything else → null. */
export function normIssn(s: string): string | null {
  const v = s.replace(/[^0-9xX]/g, '').toUpperCase();
  return /^\d{7}[\dX]$/.test(v) ? v : null;
}

export type ExtractResult =
  | { ok: true; rows: JournalListRow[]; journals: number }
  | { ok: false; message: string };

/** The SCImago "Download data" file: Rank;Sourceid;Title;Type;Issn;SJR;SJR Best Quartile;… */
export function extractSjrRows(table: string[][]): ExtractResult {
  const [header, ...data] = table;
  if (!header) return { ok: false, message: 'The file is empty.' };
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const iIssn = col('Issn');
  const iQ = col('SJR Best Quartile');
  const iTitle = col('Title');
  const iType = col('Type');
  if ([iIssn, iQ, iTitle, iType].some((i) => i < 0)) {
    return {
      ok: false,
      message: `This is not a SCImago file: it needs the columns Title, Type, Issn and SJR Best Quartile. Found: ${header.slice(0, 8).join(', ')}…`,
    };
  }
  const rows = data.flatMap((r) => {
    const q = (r[iQ] ?? '').trim();
    return (r[iIssn] ?? '').split(',')
      .map((s) => normIssn(s))
      .filter((x): x is string => x !== null)
      .map((issn) => ({
        issn,
        title: (r[iTitle] ?? '').trim().slice(0, 500),
        sourceType: (r[iType] ?? '').trim().toLowerCase().slice(0, 60),
        quartile: /^Q[1-4]$/.test(q) ? q : null,
      }));
  });
  if (rows.length === 0) return { ok: false, message: 'No journal in this file has a valid ISSN.' };
  return { ok: true, rows, journals: data.length };
}

/** A Web of Science (Master Journal List) or Scopus source list: any column whose name has "ISSN". */
export function extractListRows(table: string[][]): ExtractResult {
  const [header, ...data] = table;
  if (!header) return { ok: false, message: 'The file is empty.' };
  const issnCols = header.map((h, i) => (/issn/i.test(h) ? i : -1)).filter((i) => i >= 0);
  const iTitle = header.findIndex((h) => /title/i.test(h));
  if (issnCols.length === 0) {
    return { ok: false, message: `No ISSN column in this file. Found: ${header.slice(0, 8).join(', ')}…` };
  }
  const rows = data.flatMap((r) => [...new Set(
    issnCols.map((i) => normIssn(r[i] ?? '')).filter((x): x is string => x !== null),
  )].map((issn) => ({ issn, title: iTitle >= 0 ? (r[iTitle] ?? '').trim().slice(0, 500) : '' })));
  if (rows.length === 0) return { ok: false, message: 'No journal in this file has a valid ISSN.' };
  return { ok: true, rows, journals: data.length };
}
