import { isBitAffiliation } from './names';

/**
 * Reads the Patent Office Journal (IP India's weekly Official Journal, the statutory publication
 * of every Indian patent application and grant) from the positioned text of its PDF pages.
 *
 * Two kinds of page matter (layout verified on issues of 2021–2026):
 *  - An application page, one per published application: "(21) Application No.202331085872 A",
 *    "(43) Publication Date", "(22) Date of filing", "(54) Title of the invention" across the page,
 *    then a right-hand column with "(71) Name of Applicant" and "(72) Name of Inventor", each
 *    person numbered "1)ROY, Dr. Anupam" and followed by an address. A long inventor list may run
 *    on to the next page.
 *  - The grant table ("Publication Under Section 43(2) in Respect of the Grant"): one row per
 *    granted patent — patent number, application number, filing date, title, patentee, the date
 *    the application was published, office. Every cell is centred vertically on its row, which is
 *    how a title wrapped over several lines is given to the right row.
 *
 * Pure: no PDF library and no network, so it is tested on saved pages.
 */

/** One run of text on a page, as the PDF reader gives it: position of its left baseline, width. */
export interface TextItem { x: number; y: number; w: number; s: string }

export interface JournalPerson { name: string; bit: boolean }

export interface JournalApplication {
  applicationNo: string;
  title: string;
  /** ISO dates (YYYY-MM-DD); '' when the journal had none. */
  filedDate: string;
  publishedDate: string;
  applicants: string[];
  inventors: JournalPerson[];
}

export interface JournalGrant {
  patentNo: string;
  applicationNo: string;
  title: string;
  patentee: string;
  filedDate: string;
  /** When the application itself was published (the grant table's "u/s 11(A)" column). */
  publishedDate: string;
  office: string;
}

export interface ParsedJournal { applications: JournalApplication[]; grants: JournalGrant[] }

/* ─────────────────────────────── text helpers ─────────────────────────────── */

const DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** "19/04/2024" → "2024-04-19"; anything else → ''. */
export function isoDate(s: string): string {
  const m = s.trim().match(DATE);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

export interface Line { y: number; items: TextItem[]; text: string }

/** Joins runs left to right; a run that starts where the last one ended continues the same word. */
function joinRuns(items: TextItem[]): string {
  let out = '';
  let end = -Infinity;
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    out += (out && it.x - end > 1.5 ? ' ' : '') + it.s;
    end = it.x + it.w;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Groups runs into lines (same baseline, give or take 2 points), top of the page first. */
function linesOf(items: TextItem[]): Line[] {
  const lines: Array<{ y: number; items: TextItem[] }> = [];
  for (const it of [...items].filter((i) => i.s.trim()).sort((a, b) => b.y - a.y)) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= 2);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  return lines.sort((a, b) => b.y - a.y).map((l) => ({ ...l, text: joinRuns(l.items) }));
}

const SMALL = new Set(['of', 'and', 'the', 'for', 'in', 'on', 'at', 'to', 'a', 'an', 'by', 'with']);

/** "BIRLA INSTITUTE OF TECHNOLOGY MESRA" → "Birla Institute of Technology Mesra". Mixed case is kept. */
export function tidyCase(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (/[a-z]/.test(t)) return t;
  return t.toLowerCase().split(' ').map((w, i) => (
    i > 0 && SMALL.has(w) ? w : w.replace(/(^|[-'(.])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())
  )).join(' ');
}

/** "ROY, Dr. Anupam" → "Dr. Anupam Roy"; "Dr. Gajendra Kant Mishra" stays as it is. */
export function personName(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim().replace(/[,;.]+$/, '');
  const at = s.indexOf(',');
  if (at < 0) return tidyCase(s);
  const family = s.slice(0, at).trim();
  const given = s.slice(at + 1).trim();
  return given ? `${tidyCase(given)} ${tidyCase(family)}` : tidyCase(family);
}

/** An Indian application number as the journal prints it, the way the portal stores it. */
export function journalNumber(raw: string): string {
  const s = raw.toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^(\d{1,6})\/([A-Z]+)\/(\d{4})$/);
  return m ? `${Number(m[1])}/${m[2]}/${m[3]}` : s;
}

/* ─────────────────────────────── application pages ─────────────────────────────── */

interface Pending {
  app: JournalApplication;
  /** x where the right-hand column (applicants, inventors) starts. */
  colX: number;
  mode: 'applicants' | 'inventors' | null;
  person: { name: string; address: string } | null;
  done: boolean;
}

function closePerson(p: Pending) {
  if (!p.person) return;
  // Inventors are printed "SURNAME, Given"; applicants are often companies ("HUAWEI TECHNOLOGIES CO., LTD.").
  const name = p.mode === 'inventors' ? personName(p.person.name) : tidyCase(p.person.name);
  if (name && name.toUpperCase() !== 'NA') {
    if (p.mode === 'applicants') p.app.applicants.push(name);
    if (p.mode === 'inventors') {
      p.app.inventors.push({ name, bit: isBitAffiliation(p.person.address) || /\bmesra\b/i.test(p.person.address) });
    }
  }
  p.person = null;
}

/** The right-hand column, line by line: "(71) Name of Applicant :", "1)NAME", "Address of Applicant :…". */
function readPeople(p: Pending, lines: Line[]) {
  for (const line of lines) {
    const t = line.text;
    if (/\(71\)\s*Name of Applicant/i.test(t)) { closePerson(p); p.mode = 'applicants'; continue; }
    if (/\(72\)\s*Name of Inventor/i.test(t)) { closePerson(p); p.mode = 'inventors'; continue; }
    if (!p.mode) continue;
    if (/^Name of Applicant\s*:\s*NA\b/i.test(t) || /^Address of Applicant\s*:\s*NA\b/i.test(t)) { closePerson(p); continue; }
    const numbered = t.match(/^(\d{1,3})\)\s*(.+)$/);
    if (numbered) { closePerson(p); p.person = { name: numbered[2]!, address: '' }; continue; }
    if (!p.person) continue;
    const before = t.split(/-{4,}/)[0]!.replace(/^Address of Applicant\s*:\s*/i, '').trim();
    if (before) p.person.address += ` ${before}`;
    if (/-{4,}/.test(t)) closePerson(p);
  }
}

function readApplicationPage(items: TextItem[]): Pending | null {
  const lines = linesOf(items);
  const head = lines.find((l) => /\(21\)\s*Application No/i.test(l.text));
  if (!head) return null;
  const number = head.text.match(/Application No\.?\s*:?\s*([0-9]+(?:\s*\/\s*[A-Z]+\s*\/\s*\d{4})?)/i);
  if (!number) return null;

  const all = lines.map((l) => l.text).join('\n');
  const pub = all.match(/\(43\)\s*Publication Date\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const filed = all.match(/\(22\)\s*Date of filing of Application\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);

  // A marker such as "(54)" may come split in two runs ("(" "54) Title…"): find it by line, and by
  // the run that holds its number.
  const mark = (n: number) => {
    const line = lines.find((l) => new RegExp(`\\(\\s*${n}\\s*\\)`).test(l.text));
    if (!line) return undefined;
    const run = line.items.find((i) => new RegExp(`^\\(?\\s*${n}\\s*\\)`).test(i.s.trim()));
    return { y: line.y, x: run ? run.x - (run.s.trim().startsWith('(') ? 0 : 3) : 0 };
  };
  const at21 = mark(21);
  const at71 = mark(71);
  const at54 = mark(54);
  const at51 = mark(51);
  const at57 = mark(57);
  const colX = (at71 ?? at21)?.x || 300;

  // The title runs across the whole page, from (54) down to the first line of either column.
  let title = '';
  if (at54) {
    const floor = Math.max(at71?.y ?? -Infinity, at51?.y ?? -Infinity);
    title = joinLines(lines.filter((l) => l.y <= at54.y + 1 && l.y > floor + 1))
      .replace(/^\(54\)\s*Title of the invention\s*:?\s*/i, '');
  }

  const p: Pending = {
    app: {
      applicationNo: journalNumber(number[1]!),
      title: title.trim(),
      filedDate: filed ? isoDate(filed[1]!) : '',
      publishedDate: pub ? isoDate(pub[1]!) : '',
      applicants: [],
      inventors: [],
    },
    colX, mode: null, person: null, done: !!at57,
  };
  const top = at71 ? at71.y + 1 : Infinity;
  const bottom = at57 ? at57.y : -Infinity;
  readPeople(p, linesOf(items.filter((i) => i.x >= colX - 3 && i.y <= top && i.y > bottom)));
  return p;
}

function joinLines(lines: Line[]): string {
  // A word broken at a hyphen at the end of a line ("HOT-" / "FILL") is one word again.
  return lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').replace(/(\w)- (?=\w)/g, '$1-').trim();
}

/** A page that carries on the inventor list of the application before it. */
function continueApplication(p: Pending, items: TextItem[]) {
  const at57 = items.find((i) => /^\(57\)/.test(i.s.trim()));
  const bottom = at57 ? at57.y : -Infinity;
  readPeople(p, linesOf(items.filter((i) => i.x >= p.colX - 3 && i.y > bottom)));
  if (at57) p.done = true;
}

/* ─────────────────────────────── the grant table ─────────────────────────────── */

/** Left edges of the table's columns (the x where cell text starts). */
interface GrantColumns {
  appX: number; filedX: number; priorityX: number; titleX: number; patenteeX: number; pubX: number; officeX: number;
  /** Baseline of the header's lowest line on this page; rows lie below it. */
  headerFloor: number;
}

/**
 * Column edges from the table header. A header is centred over its column while the cells are
 * left-aligned, so each edge is the left edge of cell text (one that recurs on several rows) just
 * left of the header word; failing that, a fixed allowance. Null when the page has no header.
 */
function grantColumns(items: TextItem[]): GrantColumns | null {
  const find = (re: RegExp) => items.filter((i) => re.test(i.s));
  const patentee = find(/Patentee/i)[0];
  const title = find(/Title of Invention/i)[0];
  if (!patentee || !title) return null;
  const header = items.filter((i) => Math.abs(i.y - title.y) <= 30);
  const headerFloor = Math.min(...header.map((i) => i.y));
  const inHeader = (re: RegExp, from: number, to: number) => header.filter((i) => re.test(i.s) && i.x >= from && i.x < to)
    .map((i) => i.x).sort((a, b) => a - b)[0];

  const appHead = inHeader(/Application/i, 0, title.x);
  if (appHead === undefined) return null;
  const filedHead = inHeader(/Date of|Application|^D$/i, appHead + 20, title.x) ?? appHead + 90;
  const priorityHead = inHeader(/Date of|Priority|^Pri/i, filedHead + 30, title.x) ?? filedHead + 60;
  const pubHead = inHeader(/Date of|Publication/i, patentee.x + 30, Infinity) ?? patentee.x + 90;
  const officeHead = inHeader(/Appropriat|Office/i, pubHead + 20, Infinity) ?? pubHead + 50;

  // Left edges of cell text below the header, counted once per line.
  const seen = new Map<number, Set<number>>();
  for (const i of items) {
    if (i.y >= headerFloor - 1) continue;
    const x = Math.round(i.x);
    if (!seen.has(x)) seen.set(x, new Set());
    seen.get(x)!.add(Math.round(i.y));
  }
  const edgeFor = (head: number, fallback: number) => {
    const near = [...seen.entries()].filter(([x, ys]) => ys.size >= 2 && x >= head - 30 && x <= head + 3)
      .sort((a, b) => b[1].size - a[1].size || b[0] - a[0]);
    return near.length ? near[0]![0] : head - fallback;
  };
  return {
    appX: edgeFor(appHead, 10),
    filedX: edgeFor(filedHead, 16),
    priorityX: edgeFor(priorityHead, 16),
    titleX: edgeFor(title.x, 20),
    patenteeX: edgeFor(patentee.x, 20),
    pubX: edgeFor(pubHead, 12),
    officeX: edgeFor(officeHead, 10),
    headerFloor,
  };
}

/** Cost of a line given to no row: the end of a row cut by a page break. */
const SKIP_LINE = 150;
/** Cost of a row with nothing in this column. */
const EMPTY_CELL = 400;
/** Cost of a cell that spans the wider gap left between two rows. */
const ROW_GAP = 1000;

/**
 * Splits a column's lines (top first) among the rows (top first). Each cell is centred on its row's
 * baseline, and rows are set apart by a wider gap than the lines inside a cell (about 16 points
 * against 11.5). The split chosen is the one whose blocks of consecutive lines sit best centred on
 * their rows (least squared distance) without spanning such a gap — worked out over the whole page
 * at once, so that one awkward cell cannot push every cell below it into the wrong row. Centring
 * alone would not do: a line added at each end leaves a block's centre where it was.
 */
export function cellsByRow(lines: Line[], rows: number[]): { cells: string[]; lead: string } {
  const n = lines.length;
  const k = rows.length;
  // Line spacing inside a cell: most gaps are inside a cell, so the median is that spacing.
  const gaps = lines.slice(1).map((l, i) => lines[i]!.y - l.y);
  const spacing = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? Infinity;
  // wideBefore[i]: wide gaps between line 0 and line i.
  const wideBefore = [0];
  gaps.forEach((g, i) => wideBefore.push(wideBefore[i]! + (gaps.length >= 3 && g > spacing * 1.25 ? 1 : 0)));
  const cost = (from: number, to: number, row: number) => (
    from === to ? EMPTY_CELL
      : ((lines[from]!.y + lines[to - 1]!.y) / 2 - rows[row]!) ** 2 + ROW_GAP * (wideBefore[to - 1]! - wideBefore[from]!)
  );
  // best[j][i]: least cost with the first j rows given blocks out of the first i lines.
  const best = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const from = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= n; i += 1) best[0]![i] = i * SKIP_LINE;
  for (let j = 1; j <= k; j += 1) {
    for (let i = 0; i <= n; i += 1) {
      for (let p = 0; p <= i; p += 1) {
        const c = best[j - 1]![p]! + cost(p, i, j - 1);
        if (c < best[j]![i]!) { best[j]![i] = c; from[j]![i] = p; }
      }
    }
  }
  let end = 0;
  for (let i = 0; i <= n; i += 1) {
    if (best[k]![i]! + (n - i) * SKIP_LINE < best[k]![end]! + (n - end) * SKIP_LINE) end = i;
  }
  const cells: string[] = new Array<string>(k).fill('');
  for (let j = k; j >= 1; j -= 1) {
    const start = from[j]![end]!;
    cells[j - 1] = joinLines(lines.slice(start, end));
    end = start;
  }
  // Lines above the first row's cell: the rest of a row the page break cut.
  return { cells, lead: joinLines(lines.slice(0, end)) };
}

/** One page of the grant table. `lead*`: the top of the page, continuing the last row of the page before. */
interface GrantPage {
  /** One per row; null where the row is not a grant (no valid application number). */
  rows: Array<JournalGrant | null>;
  leadTitle: string;
  leadPatentee: string;
}

function readGrantPage(all: TextItem[], cols: GrantColumns): GrantPage {
  const items = all.filter((i) => i.y < cols.headerFloor - 1);
  const lines = linesOf(items);
  // A row starts with its serial number, then a patent number of 5–7 digits on the same baseline.
  const rows: Array<{ y: number; patentNo: string }> = [];
  for (const line of lines) {
    const sorted = [...line.items].sort((a, b) => a.x - b.x);
    const serial = sorted[0];
    if (!serial || !/^\d{1,5}$/.test(serial.s.trim()) || serial.x >= cols.appX - 15) continue;
    // The number may come in two runs ("5327" "08").
    const patent = joinRuns(sorted.filter((i) => i !== serial && i.x < cols.appX - 2)).replace(/\s+/g, '');
    if (/^\d{5,7}$/.test(patent)) rows.push({ y: line.y, patentNo: patent });
  }
  const between = (from: number, to: number) => items.filter((i) => i.x >= from - 2 && i.x < to - 2);
  const ys = rows.map((r) => r.y);
  const titles = cellsByRow(linesOf(between(cols.titleX, cols.patenteeX)), ys);
  const patentees = cellsByRow(linesOf(between(cols.patenteeX, cols.pubX)), ys);

  const grants = rows.map((r, i): JournalGrant | null => {
    // A cell of one or two lines (a date over a time) sits within a few points of the row's baseline.
    const near = (from: number, to: number, reach: number) => linesOf(
      between(from, to).filter((it) => Math.abs(it.y - r.y) <= reach),
    );
    const dateIn = (from: number, to: number) => {
      for (const l of near(from, to, 8)) {
        const d = isoDate(l.text.replace(/\s+/g, '').slice(0, 10));
        if (d) return d;
      }
      return '';
    };
    const app = near(cols.appX, cols.filedX, 6).map((l) => l.text.replace(/\s+/g, '')).join('');
    return {
      patentNo: r.patentNo,
      applicationNo: journalNumber(app),
      title: titles.cells[i]!,
      patentee: patentees.cells[i]!,
      filedDate: dateIn(cols.filedX, cols.priorityX),
      publishedDate: dateIn(cols.pubX, cols.officeX),
      office: near(cols.officeX, Infinity, 8).map((l) => l.text).join('').replace(/[^A-Za-z]/g, '').toUpperCase(),
    };
  }).map((g) => (g && /^(\d{12}|\d{1,6}\/[A-Z]+\/\d{4})$/.test(g.applicationNo) ? g : null));
  return { rows: grants, leadTitle: titles.lead, leadPatentee: patentees.lead };
}

/* ─────────────────────────────── the whole issue ─────────────────────────────── */

/** Reads a part of an issue page by page. Feed pages in order; call `result()` at the end. */
export class JournalReader {
  private applications: JournalApplication[] = [];
  private grants: JournalGrant[] = [];
  private pending: Pending | null = null;
  private cols: GrantColumns | null = null;
  /** The last row of the grant table so far, which the next page may continue. */
  private lastRow: JournalGrant | null = null;

  page(items: TextItem[]): void {
    const app = readApplicationPage(items);
    if (app) {
      this.finish();
      this.pending = app;
      this.cols = null;
      if (app.done) this.finish();
      return;
    }
    const grantHeading = items.some((i) => /in Respect of the Grant|Name of Patentee/i.test(i.s));
    if (this.pending && !grantHeading) {
      // An inventor list runs on to one more page at most; the abstract follows it.
      continueApplication(this.pending, items);
      this.finish();
      return;
    }
    this.finish();
    if (grantHeading) this.cols = null;
    // A page with no header continues the table above it: same columns, rows from the top.
    this.cols = grantColumns(items) ?? (this.cols ? { ...this.cols, headerFloor: Infinity } : null);
    if (!this.cols) return;
    const continued = this.cols.headerFloor === Infinity;
    const page = readGrantPage(items, this.cols);
    if (page.rows.length === 0) {
      // Past the end of the table: whatever follows is another section.
      this.cols = null;
      this.lastRow = null;
      return;
    }
    // A row cut by the page break carries on at the top of this page.
    if (continued && this.lastRow) {
      if (page.leadTitle) this.lastRow.title = `${this.lastRow.title} ${page.leadTitle}`.trim();
      if (page.leadPatentee) this.lastRow.patentee = `${this.lastRow.patentee} ${page.leadPatentee}`.trim();
    }
    for (const g of page.rows) if (g) this.grants.push(g);
    this.lastRow = page.rows[page.rows.length - 1]!;
  }

  private finish() {
    if (!this.pending) return;
    closePerson(this.pending);
    if (this.pending.app.applicationNo) this.applications.push(this.pending.app);
    this.pending = null;
  }

  result(): ParsedJournal {
    this.finish();
    return { applications: this.applications, grants: this.grants };
  }
}

export function parseJournalPages(pages: TextItem[][]): ParsedJournal {
  const reader = new JournalReader();
  for (const p of pages) reader.page(p);
  return reader.result();
}
