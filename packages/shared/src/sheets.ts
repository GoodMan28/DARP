/*
 * Reads the first sheet of an Excel workbook (.xlsx) into rows of text, the same shape parseCsv
 * gives, so a file IQAC opened and saved in Excel loads like the CSV it came from. An .xlsx is a zip
 * of XML files; the caller supplies the two things that differ between the browser and Node
 * (inflating a zip entry, decoding UTF-8), so this stays pure. The old binary .xls is not read.
 */

export interface SheetIo {
  /** Raw DEFLATE (zip method 8) → bytes. */
  inflateRaw: (data: Uint8Array) => Promise<Uint8Array>;
  utf8: (data: Uint8Array) => string;
}

interface ZipEntry { name: string; method: number; size: number; offset: number }

const u16 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u32 = (b: Uint8Array, i: number) => (u16(b, i) | (u16(b, i + 2) << 16)) >>> 0;

function zipEntries(b: Uint8Array): ZipEntry[] {
  // The end-of-central-directory record is in the last 64 KB (it may carry a comment).
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i -= 1) {
    if (u32(b, i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('not a zip');
  const count = u16(b, end + 10);
  let p = u32(b, end + 16);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n += 1) {
    if (u32(b, p) !== 0x02014b50) throw new Error('broken zip directory');
    const nameLen = u16(b, p + 28);
    const name = String.fromCharCode(...b.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, method: u16(b, p + 10), size: u32(b, p + 20), offset: u32(b, p + 42) });
    p += 46 + nameLen + u16(b, p + 30) + u16(b, p + 32);
  }
  return out;
}

async function entryText(b: Uint8Array, e: ZipEntry, io: SheetIo): Promise<string> {
  const start = e.offset + 30 + u16(b, e.offset + 26) + u16(b, e.offset + 28);
  const raw = b.subarray(start, start + e.size);
  if (e.method === 0) return io.utf8(raw);
  if (e.method === 8) return io.utf8(await io.inflateRaw(raw));
  throw new Error(`unsupported zip method ${e.method}`);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => (
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()]!
));

/** The text of every <t> in a string item, leaving out phonetic hints (<rPh>). */
const textOf = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
  .map((m) => unescapeXml(m[1]!)).join('');

/** "AB12" → 27 (zero-based column). */
function columnOf(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function readXlsx(bytes: Uint8Array, io: SheetIo): Promise<string[][]> {
  let entries: ZipEntry[];
  try {
    entries = zipEntries(bytes);
  } catch {
    throw new Error('This is not an Excel (.xlsx) file. Save it from Excel as .xlsx or .csv and try again.');
  }
  const byName = new Map(entries.map((e) => [e.name.replace(/^\/+/, ''), e]));
  const read = async (name: string) => { const e = byName.get(name); return e ? entryText(bytes, e, io) : null; };

  // The first sheet in the workbook's own order, through its relationship id.
  let sheetPath: string | null = null;
  const workbook = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  const rid = workbook?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (rid && rels) {
    const target = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0])
      .find((r) => r.includes(`Id="${rid}"`))?.match(/Target="([^"]+)"/)?.[1];
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  if (!sheetPath || !byName.has(sheetPath)) {
    sheetPath = [...byName.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0] ?? null;
  }
  const sheet = sheetPath ? await read(sheetPath) : null;
  if (!sheet) throw new Error('This Excel file has no sheet to read.');

  const shared = [...((await read('xl/sharedStrings.xml')) ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!));

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    for (const c of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const body = c[2] ?? '';
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? 'n';
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let text = '';
      if (type === 's') text = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') text = textOf(body);
      else if (v !== undefined) text = unescapeXml(v);
      const col = ref ? columnOf(ref) : row.length;
      while (row.length < col) row.push('');
      row[col] = text;
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
