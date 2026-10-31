import ExcelJS from 'exceljs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { and, between, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { records, users, departments, evidenceFiles } from '@/server/db/schema';
import type { PeriodType, WorkbookKey } from '@darp/shared/modules/types';
import type { ReportYearType } from '@darp/shared/reports';
import { labelFor } from '@/server/records/periods';
import { getModule } from '@darp/shared/modules';
import { scopeFilter } from '@/server/records/scope';
import type { YearRange } from '@/server/records/range';
import type { SessionUser } from '@/server/auth/session';
import { decryptPii, isEncrypted, maskAadhaar, maskPan } from '@/server/crypto/pii';
import { log } from '@/server/log';
import { derivedValues } from '@/server/journals/ranking';
import {
  buildPlans, plannedHeaders, norm, amountInWords, EXPORTABLE_STATUSES, DERIVED_PREFIX, PROFILE_FORM_FIGURES, type SheetPlan,
} from './mapping';
import {
  findTableHeader, addMissingHeaders, headerSpan, tableEnd, insertRows, retitleSheet, findLabelRow, textOf, withoutLetter,
} from './template';
import { figuresForUsers } from '@/server/rollups/completion';
import { defaultRange } from '@/server/records/range';

const TEMPLATE_DIR = process.env.EXPORT_TEMPLATE_DIR ?? 'templates';

/**
 * 'template' — the original workbook was found on disk and is opened, filled and streamed,
 *   so merged headers, dropdown lists and formatting survive untouched.
 * 'generated' — no original was found, so the sheet is built from the `exportAs` headers in
 *   the module configs. The column wording is identical either way.
 */
export type ExportMode = 'template' | 'generated';

export interface ExportOptions {
  /** Only records whose reporting year falls in this range (default: every year). */
  range?: YearRange;
  /** Plaintext Aadhaar/PAN. Admin only, audited by the caller, and never the default. */
  includePii: boolean;
  /** Restrict to one department (used by an HOD export). */
  departmentId?: string | null;
  /** Restrict to these departments (a report's department filter). */
  departmentIds?: string[] | null;
  /** Only these modules' sheets (a report's module filter). */
  moduleKeys?: string[] | null;
  /**
   * The year type the range is read in: 'auto' (the default) uses each module's own type, so a
   * sheet of publications is by calendar year and one of grants by financial year.
   */
  yearType?: ReportYearType;
  /**
   * Whose export this is. When present, every row query is additionally constrained by
   * `scopeFilter()`, so the exporter can never widen what a role may see — even if the
   * route's own allow-list is later loosened. Omitted only by the row-fed test helper.
   */
  actor?: SessionUser | null;
}

export interface ExportResult {
  workbook: ExcelJS.Workbook;
  mode: ExportMode;
  /** How many Aadhaar/PAN values were written in plaintext — the caller audits this. */
  piiRevealed: number;
  sheetsWritten: number;
  rowsWritten: number;
}

export function templatePath(workbookKey: WorkbookKey): string {
  return resolve(join(TEMPLATE_DIR, `${workbookKey}.xlsx`));
}

export function hasTemplate(workbookKey: WorkbookKey): boolean {
  /* eslint-disable-next-line security/detect-non-literal-fs-filename --
     the path is built from a fixed WorkbookKey union and a server-side env var;
     no user input reaches it. */
  return existsSync(templatePath(workbookKey));
}

/* ─────────────────────────────── cell helpers ─────────────────────────────── */

/** `cell.text` flattens rich text and formula results; an empty part of a merged range reads ''. */
const cellText = textOf;

function headerIndex(sheet: ExcelJS.Worksheet, headerRow: number): Map<string, number> {
  const map = new Map<string, number>();
  sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
    const key = norm(cellText(cell));
    if (key && !map.has(key)) map.set(key, col);
  });
  return map;
}

function firstEmptyRowAfter(sheet: ExcelJS.Worksheet, headerRow: number): number {
  let r = headerRow + 1;
  while (r <= sheet.rowCount) {
    let empty = true;
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      if (cellText(cell).trim()) empty = false;
    });
    if (empty) return r;
    r++;
  }
  return Math.max(sheet.rowCount + 1, headerRow + 1);
}

function findLabelCell(sheet: ExcelJS.Worksheet, label: string): { row: number; col: number } | null {
  const wanted = norm(label);
  let hit: { row: number; col: number } | null = null;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (hit) return;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      if (!hit && norm(cellText(cell)) === wanted) hit = { row: rowNumber, col };
    });
  });
  return hit;
}

/* ─────────────────────── generated-workbook sheet building ─────────────────────── */

/**
 * Creates the sheet and its header row from the plan when there is no original workbook.
 * If the sheet already exists (one sheet holding two tables, as in Consultancy) the missing
 * headers are appended to the right of the existing header row.
 */
function ensureGeneratedSheet(wb: ExcelJS.Workbook, plan: SheetPlan): ExcelJS.Worksheet {
  const existing = wb.getWorksheet(plan.sheet);
  const sheet = existing ?? wb.addWorksheet(plan.sheet.slice(0, 31));
  const headerRow = sheet.getRow(1);
  const present = headerIndex(sheet, 1);
  let nextCol = present.size === 0 ? 1 : Math.max(...present.values()) + 1;

  for (const header of plannedHeaders(plan)) {
    if (present.has(norm(header))) continue;
    headerRow.getCell(nextCol).value = header;
    sheet.getColumn(nextCol).width = Math.min(Math.max(header.length + 2, 12), 48);
    present.set(norm(header), nextCol);
    nextCol += 1;
  }

  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', wrapText: true };
  headerRow.commit();
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return sheet;
}

/* ──────────────────────────────── row loading ──────────────────────────────── */

export interface ExportRow {
  data: Record<string, unknown>;
  ownerName: string;
  department: string;
  profile: Record<string, string>;
  /** The record's reporting year, written where a template asks for a year but the record holds a date. */
  periodYear?: number;
  /** That year as a label in the report's year type: "2023", "FY 2023-24", "AY 2023-24". */
  periodLabel?: string;
  /** The Faculty Profile form only: the owner's counted and declared figures, by counter key. */
  figures?: Record<string, number>;
}

interface PiiContext { includePii: boolean; revealed: number }

function presentPii(value: unknown, kind: 'pan' | 'aadhaar', ctx: PiiContext): string {
  if (value === undefined || value === null || value === '') return '';
  let plain = String(value);
  if (isEncrypted(plain)) {
    try {
      plain = decryptPii(plain);
    } catch {
      // A value that fails GCM authentication is never guessed at — it is left blank.
      log.error('export: pii decryption failed', { kind });
      return '';
    }
  }
  if (ctx.includePii) {
    ctx.revealed += 1;
    return plain;
  }
  return kind === 'pan' ? maskPan(plain) : maskAadhaar(plain);
}

async function fetchExportRows(
  plan: SheetPlan, opts: ExportOptions, ctx: PiiContext,
): Promise<ExportRow[]> {
  const where = [
    eq(records.moduleKey, plan.moduleKey),
    isNull(records.deletedAt),
    inArray(records.status, EXPORTABLE_STATUSES),
  ];
  const own = getModule(plan.moduleKey)?.periodType ?? 'CY';
  const type = yearTypeFor(own, opts.yearType);
  // The module's own year type is its reporting year. Another type needs a full date: a record
  // dated by year alone has no FY or AY of its own, and is left out rather than guessed.
  const yearColumn = type === own ? records.periodYear
    : type === 'CY' ? records.cyYear : type === 'FY' ? records.fyYear : records.ayYear;
  // The Faculty Profile is not dated: it is one record per person, whatever the range.
  if (opts.range && getModule(plan.moduleKey)?.periodic !== false) {
    where.push(between(yearColumn, opts.range.from, opts.range.to));
  }
  if (opts.departmentId) where.push(eq(records.departmentId, opts.departmentId));
  if (opts.departmentIds?.length) where.push(inArray(records.departmentId, opts.departmentIds));
  // Deny-by-default: the exporter sees no more than the caller's own scope.
  if (opts.actor) {
    const m = getModule(plan.moduleKey);
    if (!m) return [];
    where.push(scopeFilter(opts.actor, m));
  }

  const rows = await db
    .select({
      data: records.data,
      periodYear: records.periodYear,
      year: yearColumn,
      ownerUserId: records.ownerUserId,
      ownerName: users.name,
      department: departments.name,
    })
    .from(records)
    .innerJoin(users, eq(users.id, records.ownerUserId))
    .leftJoin(departments, eq(departments.id, records.departmentId))
    .where(and(...where))
    .orderBy(yearColumn, records.createdAt);

  const filtered = rows.filter((r) => {
    if (!plan.rowFilter) return true;
    const v = (r.data as Record<string, unknown>)[plan.rowFilter.field];
    return typeof v === 'string' && plan.rowFilter.in.includes(v);
  });

  // Profile lookups for sheets that need PAN/designation from the owner.
  const profiles = new Map<string, Record<string, string>>();
  if (plan.fromProfile?.length) {
    const owners = [...new Set(filtered.map((r) => r.ownerUserId))];
    if (owners.length) {
      const profileRows = await db
        .select({ ownerUserId: records.ownerUserId, data: records.data })
        .from(records)
        .where(and(
          eq(records.moduleKey, 'profile'),
          isNull(records.deletedAt),
          inArray(records.ownerUserId, owners),
        ));
      for (const p of profileRows) {
        const d = p.data as Record<string, unknown>;
        profiles.set(p.ownerUserId, {
          pan: presentPii(d.pan, 'pan', ctx),
          designation: String(d.designation ?? ''),
        });
      }
    }
  }

  // The Faculty Profile form carries each person's figures for the report's years. Only people
  // whose profile this export already reads (the rows above, scoped by scopeFilter) are counted.
  const figures = plan.layout === 'profileForm'
    ? await figuresForUsers([...new Set(filtered.map((r) => r.ownerUserId))], opts.range ?? await defaultRange())
    : null;

  return filtered.map((r) => {
    const year = r.year ?? r.periodYear;
    return {
      data: r.data as Record<string, unknown>,
      ownerName: r.ownerName,
      department: r.department ?? '',
      periodYear: year,
      periodLabel: labelFor(year, type),
      profile: profiles.get(r.ownerUserId) ?? {},
      figures: figures?.get(r.ownerUserId),
    };
  });
}

/** The year type a sheet is read in: its module's own, unless the report asks for one type throughout. */
export function yearTypeFor(own: PeriodType, asked: ReportYearType | undefined): PeriodType {
  return !asked || asked === 'auto' ? own : asked;
}

function digits(raw: unknown): number {
  const n = Number(String(raw).replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function renderValue(
  plan: SheetPlan, fieldKey: string, row: ExportRow, ctx: PiiContext,
): Promise<string | number> {
  const m = getModule(plan.moduleKey);
  const field = m?.fields.find((f) => f.key === fieldKey);
  const raw = row.data[fieldKey];
  if (raw === undefined || raw === null || raw === '') return field?.naWhenEmpty ? 'NA' : '';

  if (field?.pii === 'encrypted') {
    return presentPii(raw, field.type === 'pan' ? 'pan' : 'aadhaar', ctx);
  }

  if (field?.type === 'money') {
    const n = digits(raw);
    const divisor = plan.divideBy?.[fieldKey] ?? 1;
    return divisor === 1 ? n : n / divisor;
  }

  if (field?.exportWith) {
    // A start date with its end date in one column: "03-03-2025 – 07-03-2025".
    const dmy = (v: unknown) => String(v ?? '').replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3-$2-$1');
    const end = row.data[field.exportWith];
    return end ? `${dmy(raw)} – ${dmy(end)}` : dmy(raw);
  }
  if (field?.exportYear && row.periodYear && !plan.rawDates) return row.periodYear;
  // "1 year", "1.5 years", "3 years".
  if (field?.type === 'decimal') return field.unit ? `${raw} ${Number(raw) === 1 ? field.unit.replace(/s$/, '') : field.unit}` : String(raw);
  if (field?.type === 'integer') return digits(raw);

  if (field?.type === 'file') {
    // The sheet's "Attach documents" column gets a stable reference, never a local path.
    if (!UUID_RE.test(String(raw))) return '';
    const [ev] = await db
      .select({ name: evidenceFiles.originalName, id: evidenceFiles.id })
      .from(evidenceFiles)
      .where(and(eq(evidenceFiles.id, String(raw)), isNull(evidenceFiles.deletedAt)))
      .limit(1);
    return ev ? `${ev.name} (evidence id ${ev.id})` : '';
  }

  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (Array.isArray(raw)) return raw.map((v) => String(v)).join(', ');
  return String(raw);
}

/* ──────────────────────────────── the writer ──────────────────────────────── */

type RowLoader = (plan: SheetPlan) => Promise<ExportRow[]>;

/**
 * Fills one workbook. Both paths — opening the original template and generating a sheet from
 * the configs — end up in this single writer, so a future switch to real templates changes
 * only `loadWorkbook`/`ensureGeneratedSheet`, not the row logic.
 */
export async function writeWorkbook(
  workbookKey: WorkbookKey | 'full', opts: ExportOptions, loadRows: RowLoader, ctx: PiiContext,
  /** The sheets to write; by default the workbook's own (a Full data report passes its own). */
  givenPlans?: SheetPlan[],
): Promise<ExportResult> {
  const mode: ExportMode = workbookKey !== 'full' && hasTemplate(workbookKey) ? 'template' : 'generated';
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DARP — BIT Mesra';
  wb.created = new Date();

  if (mode === 'template' && workbookKey !== 'full') {
    // Read-only: the file on disk is never written back.
    await wb.xlsx.readFile(templatePath(workbookKey));
  }

  const plans = (givenPlans ?? buildPlans().filter((p) => p.workbook === workbookKey))
    .filter((p) => !opts.moduleKeys?.length || opts.moduleKeys.includes(p.moduleKey));
  const problems: string[] = [];
  let sheetsWritten = 0;
  let rowsWritten = 0;
  /** In each sheet, the last row a table used: a second table is looked for below it. */
  const usedTo = new Map<string, number>();
  const filled = new Set<string>();

  for (const plan of plans) {
    const allHeaders = plannedHeaders(plan);
    // A module IQAC's format has no sheet for yet (Outreach Activities) gets one built like a generated
    // sheet, after the format's own sheets and before "About this report".
    const own = mode === 'template' ? wb.getWorksheet(plan.sheet) : undefined;
    const sheet = mode === 'generated' || !own ? ensureGeneratedSheet(wb, plan) : own;
    if (mode === 'template' && !own) log.info('export: sheet added to the format', { workbookKey, sheet: plan.sheet });
    const builtHere = mode === 'generated' || !own;
    filled.add(sheet.name);

    // A format file that is not laid out as a table (the Faculty Profile form and two HOD sheets).
    if (!builtHere && plan.layout && plan.layout !== 'table') {
      const rows = await loadRows(plan);
      rowsWritten += await writeLaidOut(sheet, plan, rows, ctx, problems);
      if (opts.range) retitleSheet(sheet, opts.range);
      sheetsWritten += 1;
      continue;
    }

    const headerRow = builtHere ? 1 : findTableHeader(sheet, allHeaders, usedTo.get(sheet.name) ?? 0);
    if (!headerRow) {
      problems.push(`header row not found for ${plan.moduleKey} in ${plan.sheet}`);
      continue;
    }

    const index = headerIndex(sheet, headerRow);
    if (!builtHere) {
      // Columns DARP keeps that the format file has not got yet (an award's validity, a patent's
      // grant date, the journal's quartile) go to the right of its table rather than being dropped.
      const added = addMissingHeaders(sheet, headerRow, allHeaders, index);
      if (added.length) log.info('export: columns added to the format', { workbookKey, sheet: plan.sheet, added });
    }

    const rows = await loadRows(plan);
    // The journal's indexing, quartile and Impact Factor: worked out for the whole sheet at once.
    const m = getModule(plan.moduleKey);
    const derived = m && plan.columns.some((c) => c.fieldKey.startsWith(DERIVED_PREFIX))
      ? await derivedValues(m, rows.map((r, i) => ({ key: String(i), data: r.data })))
      : new Map<string, Record<string, string>>();

    let writeAt: number;
    if (!builtHere) {
      // The rows go straight under the headings. When something follows the table (a second
      // table, notes), rows are inserted so the records never run into it, leaving one blank row.
      writeAt = headerRow + 1;
      // Only the table's own columns: Student Workshops has a second table (B) beside it, whose first
      // question shares the heading row; it must not be pushed down when table A grows.
      const cols = allHeaders.map((h) => index.get(norm(h))).filter((c): c is number => !!c);
      const end = tableEnd(sheet, headerRow, cols.length ? { first: Math.min(...cols), last: Math.max(...cols) } : headerSpan(sheet, headerRow));
      const needed = writeAt + rows.length + 1;
      if (end !== null && rows.length > 0 && end < needed) insertRows(sheet, end, needed - end);
    } else {
      writeAt = firstEmptyRowAfter(sheet, headerRow);
    }
    let serial = 1;

    for (const [i, r] of rows.entries()) {
      const row = sheet.getRow(writeAt++);

      for (const col of plan.columns) {
        const at = index.get(norm(col.header));
        if (!at) continue;
        row.getCell(at).value = col.fieldKey.startsWith(DERIVED_PREFIX)
          ? derived.get(String(i))?.[col.fieldKey.slice(DERIVED_PREFIX.length)] ?? ''
          : await renderValue(plan, col.fieldKey, r, ctx);
      }

      for (const col of plan.fromProfile ?? []) {
        const at = index.get(norm(col.header));
        if (!at) continue;
        row.getCell(at).value = r.profile[col.profileFieldKey] ?? '';
      }

      // Columns the portal already knows and therefore never asks anyone to type.
      for (const col of plan.systemColumns ?? []) {
        const at = index.get(norm(col.header));
        if (!at) continue;
        if (col.kind === 'serial') row.getCell(at).value = serial;
        else if (col.kind === 'ownerName') row.getCell(at).value = r.ownerName;
        else if (col.kind === 'department') row.getCell(at).value = r.department;
        else if (col.kind === 'period') row.getCell(at).value = r.periodLabel ?? r.periodYear ?? '';
        else if (col.kind === 'amountInWords') {
          row.getCell(at).value = amountInWords(digits(r.data.earnings));
        }
      }

      row.commit();
      serial += 1;
      rowsWritten += 1;
    }
    usedTo.set(sheet.name, Math.max(headerRow, writeAt - 1));

    // Summary cells: the value goes in the cell immediately right of its label.
    for (const cell of plan.summaryCells ?? []) {
      const total = rows.reduce((sum, r) => sum + digits(r.data[cell.fieldKey]), 0);
      const found = findLabelCell(sheet, cell.label);
      if (found) {
        sheet.getRow(found.row).getCell(found.col + 1).value = total;
      } else if (builtHere) {
        // No template to carry the label, so the generated sheet writes it below the data.
        const at = firstEmptyRowAfter(sheet, headerRow) + 1;
        const summary = sheet.getRow(at);
        summary.getCell(1).value = cell.label;
        summary.getCell(2).value = total;
        summary.font = { bold: true };
        summary.commit();
      } else {
        problems.push(`summary label "${cell.label}" not found in ${workbookKey}/${plan.sheet}`);
      }
    }

    // The format's own years ("data for 2024, 2023, 2022") become the report's.
    if (opts.range) retitleSheet(sheet, opts.range, headerRow);
    sheetsWritten += 1;
  }

  // A format file's sheets that this export does not fill (a module outside the caller's office)
  // are taken out, so the file holds only what was asked for and may be shown.
  if (mode === 'template' && givenPlans && workbookKey !== 'full') {
    const own = new Set(buildPlans().filter((p) => p.workbook === workbookKey).map((p) => p.sheet));
    for (const ws of [...wb.worksheets]) {
      if (own.has(ws.name) && !filled.has(ws.name)) wb.removeWorksheet(ws.id);
    }
  }

  if (problems.length) {
    log.error('export mapping problems', { workbookKey, mode, problems });
    throw new Error(`Export mapping failed:\n- ${problems.join('\n- ')}`);
  }

  return { workbook: wb, mode, piiRevealed: ctx.revealed, sheetsWritten, rowsWritten };
}

/**
 * Fills a format sheet that is not a table. Returns the number of records written.
 *  - profileForm: column A holds the questions; each person gets the next free column (B, C, …).
 *  - columnsPerRecord: the questions run down one column; each record gets a column to its right.
 *  - feedbackGrid: Yes under the classification chosen and No under the others, the links below.
 */
async function writeLaidOut(
  sheet: ExcelJS.Worksheet, plan: SheetPlan, rows: ExportRow[], ctx: PiiContext, problems: string[],
): Promise<number> {
  if (plan.layout === 'profileForm') {
    const fieldRows = plan.columns.map((c) => ({ c, row: findLabelRow(sheet, 1, c.header) }));
    const figureRows = PROFILE_FORM_FIGURES.map((f) => ({ f, row: findLabelRow(sheet, 1, f.starts) }));
    for (const x of [...fieldRows.filter((y) => !y.row).map((y) => y.c.header), ...figureRows.filter((y) => !y.row).map((y) => y.f.starts)]) {
      problems.push(`row "${x.slice(0, 60)}" not found in the ${plan.sheet} form`);
    }
    const width = sheet.getColumn(2).width ?? 30;
    for (const [i, r] of rows.entries()) {
      const col = 2 + i;
      sheet.getColumn(col).width = width;
      for (const { c, row } of fieldRows) if (row) sheet.getRow(row).getCell(col).value = await renderValue(plan, c.fieldKey, r, ctx);
      for (const { f, row } of figureRows) {
        if (!row) continue;
        const v = r.figures?.[f.key];
        sheet.getRow(row).getCell(col).value = v === undefined ? '' : f.yesNo ? (v > 0 ? 'Yes' : 'No') : v;
      }
    }
    return rows.length;
  }

  if (plan.layout === 'columnsPerRecord') {
    const first = plan.columns[0];
    let labelCol = 0;
    sheet.eachRow((row) => row.eachCell((c, col) => {
      if (!labelCol && first && norm(textOf(c)) === norm(first.header)) labelCol = col;
    }));
    if (!labelCol) { problems.push(`labels not found in ${plan.sheet}`); return 0; }
    const at = (header: string) => findLabelRow(sheet, labelCol, header);
    const yearRow = plan.columns.find((c) => {
      const f = getModule(plan.moduleKey)?.fields.find((x) => x.key === c.fieldKey);
      return f?.exportYear || f?.type === 'year';
    });
    if (rows.length === 0 && yearRow) {
      // No record: the format's sample year must not be read as data.
      const r = at(yearRow.header);
      if (r) sheet.getRow(r).getCell(labelCol + 1).value = '';
    }
    for (const [i, r] of rows.entries()) {
      const col = labelCol + 1 + i;
      for (const c of plan.columns) {
        const row = at(c.header);
        if (!row) continue;
        const f = getModule(plan.moduleKey)?.fields.find((x) => x.key === c.fieldKey);
        // A financial year is written as the format writes it: "2024-25".
        const fyYear = (f?.exportYear || f?.type === 'year') && getModule(plan.moduleKey)?.periodType !== 'CY';
        sheet.getRow(row).getCell(col).value = fyYear && r.periodYear
          ? `${r.periodYear}-${String(r.periodYear + 1).slice(-2)}`
          : await renderValue(plan, c.fieldKey, r, ctx);
      }
      for (const s of plan.systemColumns ?? []) {
        if (s.kind !== 'amountInWords') continue;
        const row = at(s.header);
        if (row) sheet.getRow(row).getCell(col).value = amountInWords(digits(r.data.earnings));
      }
    }
    // The department goes under its heading (one department per HOD return; several are listed).
    const dept = (plan.systemColumns ?? []).find((s) => s.kind === 'department');
    if (dept && rows.length) {
      sheet.eachRow((row, n) => row.eachCell((c, col) => {
        if (norm(textOf(c)) === norm(dept.header)) sheet.getRow(n + 1).getCell(col).value = [...new Set(rows.map((r) => r.department))].join(', ');
      }));
    }
    return rows.length;
  }

  // feedbackGrid: the headings row is the one naming the last classification.
  let headerRow = 0;
  const options = new Map<string, number>();
  sheet.eachRow((row, n) => {
    if (headerRow) return;
    row.eachCell((c) => { if (norm(textOf(c)) === 'feedback not collected') headerRow = n; });
  });
  if (!headerRow) { problems.push(`classifications not found in ${plan.sheet}`); return 0; }
  sheet.getRow(headerRow).eachCell((c, col) => { if (col > 1) options.set(withoutLetter(textOf(c)), col); });
  for (const [i, r] of rows.entries()) {
    const answerRow = sheet.getRow(headerRow + 1 + i * 2);
    const linkRow = sheet.getRow(headerRow + 2 + i * 2);
    const chosen = options.get(withoutLetter(String(r.data.classification ?? '')));
    answerRow.getCell(1).value = r.department;
    for (const col of options.values()) {
      answerRow.getCell(col).value = col === chosen ? 'Yes' : 'No';
      linkRow.getCell(col).value = col === chosen ? String(r.data.documentLinks ?? '') : '';
    }
  }
  return rows.length;
}

/** The real export: exportable records only, straight from the database. */
export async function generateWorkbook(
  workbookKey: WorkbookKey | 'full', opts: ExportOptions, plans?: SheetPlan[],
): Promise<ExportResult> {
  const ctx: PiiContext = { includePii: opts.includePii, revealed: 0 };
  return writeWorkbook(workbookKey, opts, (plan) => fetchExportRows(plan, opts, ctx), ctx, plans);
}

/** How many rows each sheet would hold, without building the workbook (a report's preview). */
export async function countExportRows(plans: SheetPlan[], opts: ExportOptions): Promise<number[]> {
  const ctx: PiiContext = { includePii: false, revealed: 0 };
  const out: number[] = [];
  for (const plan of plans) out.push((await fetchExportRows(plan, opts, ctx)).length);
  return out;
}

/** Used by the tests: the same writer, fed rows that never touch the database. */
export async function generateWorkbookFromRows(
  workbookKey: WorkbookKey,
  opts: ExportOptions,
  rowsByModule: Record<string, ExportRow[]>,
): Promise<ExportResult> {
  const ctx: PiiContext = { includePii: opts.includePii, revealed: 0 };
  return writeWorkbook(workbookKey, opts, async (plan) => {
    const rows = rowsByModule[plan.moduleKey] ?? [];
    return rows.filter((r) => {
      if (!plan.rowFilter) return true;
      const v = r.data[plan.rowFilter.field];
      return typeof v === 'string' && plan.rowFilter.in.includes(v);
    });
  }, ctx);
}
