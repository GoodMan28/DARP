import { createReadStream } from 'node:fs';

/**
 * Reads a CSV file row by row without holding it in memory (the ROR file is 58 MB, and a whole-file
 * parse needs several times that). Handles quoted cells, doubled quotes, line breaks inside a quoted
 * cell, CRLF and a leading byte-order mark. The first row gives the headings; each later row is an object.
 */
export async function* csvRows(path: string): AsyncGenerator<Record<string, string>> {
  let header: string[] | null = null;
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let sawQuote = false;      // the last character was a quote inside a quoted cell: "" or the end?
  let first = true;

  const finishRow = (): Record<string, string> | null => {
    row.push(cell);
    cell = '';
    const done = row;
    row = [];
    if (done.length === 1 && done[0] === '') return null;          // a blank line
    if (!header) { header = done.map((h) => h.trim()); return null; }
    const out: Record<string, string> = {};
    header.forEach((h, i) => { out[h] = done[i] ?? ''; });
    return out;
  };

  for await (const chunk of createReadStream(path, { encoding: 'utf8' }) as AsyncIterable<string>) {
    let text = chunk;
    if (first) { first = false; if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); }
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i]!;
      if (quoted) {
        if (sawQuote) {
          sawQuote = false;
          if (ch === '"') { cell += '"'; continue; }
          quoted = false;                                          // the quote closed the cell: read ch below
        } else if (ch === '"') { sawQuote = true; continue; }
        else { cell += ch; continue; }
      }
      if (ch === '"' && cell === '') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { const r = finishRow(); if (r) yield r; }
      else if (ch !== '\r') cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) { const r = finishRow(); if (r) yield r; }
}
