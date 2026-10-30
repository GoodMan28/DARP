// Filling IQAC's own format files (apps/api/templates/*.xlsx) without changing their layout:
// finding each table, making room for its rows, adding the columns DARP keeps that the format has
// not got yet, and writing the report's years into titles and headings in place of the format's own.
import type ExcelJS from 'exceljs';
import type { PeriodType } from '@darp/shared/modules/types';
import type { YearRange } from '@/server/records/range';
import { lastCompletedYear } from '@/server/rollups/counters';
import { norm } from './mapping';

/** A cell's text, or '' for an empty part of a merged range (exceljs throws on those). */
export function textOf(cell: ExcelJS.Cell): string {
  if (cell.isMerged && cell.master !== cell) return '';
  let t: unknown;
  try { t = cell.text; } catch { return ''; }
  if (typeof t === 'string') return t;
  const v: unknown = cell.value;
  return v === null || v === undefined || typeof v === 'object' ? '' : String(v);
}

/**
 * The row holding a table's headings: the one among the first 30 matching the most of them (at
 * least half), searched from `after`. Two tables on one sheet (Consultancy, then Corporate
 * training) share some headings; the best match tells them apart.
 */
export function findTableHeader(sheet: ExcelJS.Worksheet, headers: string[], after = 0): number | null {
  const wanted = headers.map(norm).filter(Boolean);
  if (wanted.length === 0) return null;
  let best: { row: number; hits: number } | null = null;
  for (let r = after + 1; r <= Math.min(sheet.rowCount, after + 30); r += 1) {
    const values = new Set<string>();
    sheet.getRow(r).eachCell({ includeEmpty: false }, (c) => { values.add(norm(textOf(c))); });
    const hits = wanted.filter((w) => values.has(w)).length;
    if (hits >= Math.max(1, Math.ceil(wanted.length * 0.5)) && (!best || hits > best.hits)) best = { row: r, hits };
  }
  return best?.row ?? null;
}

/** The first and last column holding a heading in a row. */
export function headerSpan(sheet: ExcelJS.Worksheet, row: number): { first: number; last: number } {
  let first = Number.MAX_SAFE_INTEGER;
  let last = 0;
  sheet.getRow(row).eachCell({ includeEmpty: false }, (c, col) => {
    if (textOf(c).trim()) { first = Math.min(first, col); last = Math.max(last, col); }
  });
  return { first: first === Number.MAX_SAFE_INTEGER ? 1 : first, last };
}

/**
 * Adds headings the format has not got (columns DARP keeps, such as an award's validity) to the
 * right of the table, styled like its last heading. Returns the headings added.
 */
export function addMissingHeaders(
  sheet: ExcelJS.Worksheet, row: number, headers: string[], index: Map<string, number>,
): string[] {
  const added: string[] = [];
  // After the table's own last heading; a cell already in use (a second table beside it) is skipped.
  const own = headers.map((h) => index.get(norm(h))).filter((c): c is number => !!c);
  let last = own.length ? Math.max(...own) : headerSpan(sheet, row).last;
  const style = last ? sheet.getRow(row).getCell(last).style : {};
  for (const h of headers) {
    if (index.has(norm(h))) continue;
    last += 1;
    while (textOf(sheet.getRow(row).getCell(last)).trim()) last += 1;
    const cell = sheet.getRow(row).getCell(last);
    cell.value = h;
    cell.style = { ...style };
    sheet.getColumn(last).width = Math.min(Math.max(h.length / 2, 14), 40);
    index.set(norm(h), last);
    added.push(h);
  }
  return added;
}

/**
 * Where a table's free rows end: the first row below the heading with anything in the table's own
 * columns (the title of a second table), or null when nothing follows. Helper columns far to the
 * right (the format's dropdown lists) do not count.
 */
export function tableEnd(sheet: ExcelJS.Worksheet, headerRow: number, span: { first: number; last: number }): number | null {
  for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    for (let c = span.first; c <= span.last; c += 1) {
      if (textOf(row.getCell(c)).trim()) return r;
    }
  }
  return null;
}

/** Inserts `count` empty rows at `at`, moving merged cells below it down with them. */
export function insertRows(sheet: ExcelJS.Worksheet, at: number, count: number) {
  if (count <= 0) return;
  const merges: string[] = (sheet.model as { merges?: string[] }).merges ?? [];
  const below = merges
    .map((m) => ({ m, r: /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(m) }))
    .filter((x) => x.r && Number(x.r[2]) >= at);
  for (const { m } of below) sheet.unMergeCells(m);
  sheet.spliceRows(at, 0, ...Array.from({ length: count }, () => []));
  for (const { r } of below) {
    sheet.mergeCells(`${r![1]}${Number(r![2]) + count}:${r![3]}${Number(r![4]) + count}`);
  }
}

const yy = (y: number) => String(y + 1).slice(-2);

/**
 * A title or heading with the format's years replaced by the report's. The formats were made for
 * 2022 to 2024; a report for other years must say its own:
 *   "2024, 2023, 2022" (any run of years) → the report's years, in the same order
 *   "2022-2024" → "2023-2025" · "AY 2022-23 to 2024-25" → the same span in the report's years
 *   "last year (AY 2024-25)", "(CY 2024)", "(FY 2024-25)" → the report's last completed year
 *   "2022 onwards" → the report's first year onwards
 */
export function withReportYears(text: string, range: YearRange, today = new Date()): string {
  if (!/(19|20)\d\d/.test(text)) return text;
  const down = Array.from({ length: range.to - range.from + 1 }, (_, i) => range.to - i);
  const last = (t: PeriodType) => Math.min(range.to, lastCompletedYear(t, today));
  // One pass, longest form first, so a year already replaced is never replaced again.
  const pattern = new RegExp([
    String.raw`\b(AY|FY)\s*\d{4}-\d{2}\s+to\s+(?:(?:AY|FY)\s*)?\d{4}-\d{2}\b`,   // a span: AY 2022-23 to 2024-25
    String.raw`\b(AY|FY)\s*\d{4}-\d{2}\b`,                                   // one year: (AY 2024-25)
    String.raw`\bCY\s*\d{4}\b`,                                              // (CY 2024)
    String.raw`\b(?:19|20)\d\d(?:\s*,\s*(?:19|20)\d\d)+\b`,                  // 2024, 2023, 2022
    String.raw`\b(?:19|20)\d\d-(?:19|20)\d\d\b`,                             // 2022-2024
    String.raw`\b(?:19|20)\d\d onwards\b`,                                   // 2022 onwards
  ].join('|'), 'g');
  return text.replace(pattern, (m: string, spanType?: 'AY' | 'FY', oneType?: 'AY' | 'FY') => {
    if (spanType) return `${spanType} ${range.from}-${yy(range.from)} to ${range.to}-${yy(range.to)}`;
    if (oneType) return `${oneType} ${last(oneType)}-${yy(last(oneType))}`;
    if (m.startsWith('CY')) return `CY ${last('CY')}`;
    if (m.includes(',')) {
      const ys = m.split(/\s*,\s*/).map(Number);
      return (ys[0]! > ys[ys.length - 1]! ? down : [...down].reverse()).join(', ');
    }
    if (m.endsWith('onwards')) return `${range.from} onwards`;
    return `${range.from}-${range.to}`;
  });
}

/** Writes the report's years into every title and heading at or above `upTo` (all rows when omitted). */
export function retitleSheet(sheet: ExcelJS.Worksheet, range: YearRange, upTo?: number) {
  const lastRow = upTo ?? sheet.rowCount;
  for (let r = 1; r <= lastRow; r += 1) {
    sheet.getRow(r).eachCell({ includeEmpty: false }, (c) => {
      if (typeof c.value !== 'string') return;
      const next = withReportYears(c.value, range);
      if (next !== c.value) c.value = next;
    });
  }
}

/** The row in `col` whose label starts like `label` (spacing and case aside), or null. */
export function findLabelRow(sheet: ExcelJS.Worksheet, col: number, label: string, from = 1): number | null {
  const want = norm(label);
  for (let r = from; r <= sheet.rowCount; r += 1) {
    const t = norm(textOf(sheet.getRow(r).getCell(col)));
    if (t && (t === want || t.startsWith(want))) return r;
  }
  return null;
}

/** A feedback classification without its "A. " letter, for matching the format's column headings. */
export const withoutLetter = (s: string) => norm(s.replace(/^\s*[A-E]\.\s*/, ''));
