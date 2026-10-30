/**
 * Installs one of IQAC's format files as an export template:
 *   npm run templates:install -w @darp/api -- "<path to the .xlsx>" <faculty|drie|dofa|dugs|hod|cdc>
 *
 * The file is copied to templates/<key>.xlsx, unchanged except for one thing: a dropdown that
 * covers a whole column (down to row 1,048,576) is cut to row 2,000. The Excel library expands such
 * a dropdown into a million cells, which made a single export take a minute; 2,000 rows is far more
 * than any sheet holds.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';

const KEYS = ['faculty', 'drie', 'dofa', 'dugs', 'hod', 'cdc'];
const LAST_ROW = 2000;

/** "C4:C1048576 H4:H1048576" → "C4:C2000 H4:H2000". */
export function trimRanges(sqref: string): string {
  return sqref.replace(/([A-Z]+)(\d+)/g, (m, col: string, row: string) => (Number(row) > LAST_ROW ? `${col}${LAST_ROW}` : m));
}

async function main() {
  const [source, key] = process.argv.slice(2);
  if (!source || !key || !KEYS.includes(key)) {
    console.error(`Usage: npm run templates:install -w @darp/api -- "<file.xlsx>" <${KEYS.join('|')}>`);
    process.exit(1);
  }
  const zip = await JSZip.loadAsync(readFileSync(resolve(source)));
  let trimmed = 0;
  for (const name of Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))) {
    const xml = await zip.file(name)!.async('string');
    const next = xml.replace(/sqref="([^"]+)"/g, (m, ref: string) => {
      const t = trimRanges(ref);
      if (t !== ref) trimmed += 1;
      return `sqref="${t}"`;
    });
    zip.file(name, next);
  }
  const dir = resolve('templates');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${key}.xlsx`);
  writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.error(`installed ${out} (${trimmed} whole-column dropdowns cut to row ${LAST_ROW})`);
}

void main();
