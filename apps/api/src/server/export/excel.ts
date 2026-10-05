import ExcelJS from 'exceljs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { records, users, departments, evidenceFiles } from '@/server/db/schema';
import type { WorkbookKey } from '@darp/shared/modules/types';
import { getModule } from '@darp/shared/modules';
import { scopeFilter } from '@/server/records/scope';
import type { SessionUser } from '@/server/auth/session';
import { decryptPii, isEncrypted, maskAadhaar, maskPan } from '@/server/crypto/pii';
import { log } from '@/server/log';
import {
  buildPlans, plannedHeaders, norm, amountInWords, EXPORTABLE_STATUSES, type SheetPlan,
} from './mapping';

const TEMPLATE_DIR = process.env.EXPORT_TEMPLATE_DIR ?? 'templates';

/**
 * 'template' — the original workbook was found on disk and is opened, filled and streamed,
 *   so merged headers, dropdown lists and formatting survive untouched.
 * 'generated' — no original was found, so the sheet is built from the `exportAs` headers in
 *   the module configs. The column wording is identical either way.
 */
export type ExportMode = 'template' | 'generated';

export interface ExportOptions {
  cycleId: string;
  /** Plaintext Aadhaar/PAN. Admin only, audited by the caller, and never the default. */
  includePii: boolean;
  /** Restrict to one department (used by an HOD export). */
  departmentId?: string | null;
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

/** `cell.text` already flattens rich text and formula results; `value` is the fallback. */
function cellText(cell: ExcelJS.Cell): string {
  const t: unknown = cell.text;
  if (typeof t === 'string') return t;
  const v: unknown = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return '';
  return String(v);
}

/** Finds the row that holds the column headings, tolerating title and instruction rows above it. */
function findHeaderRow(sheet: ExcelJS.Worksheet, headers: string[]): number | null {
  const wanted = headers.map(norm).filter((h) => h.length > 0);
  if (wanted.length === 0) return null;
  for (let r = 1; r <= Math.min(sheet.rowCount, 15); r++) {
    const values = new Set<string>();
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => values.add(norm(cellText(cell))));
    const hits = wanted.filter((w) => values.has(w)).length;
    if (hits >= Math.max(1, Math.ceil(wanted.length * 0.5))) return r;
  }
  return null;
}

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
    eq(records.cycleId, opts.cycleId),
    isNull(records.deletedAt),
    inArray(records.status, EXPORTABLE_STATUSES),
  ];
  if (opts.departmentId) where.push(eq(records.departmentId, opts.departmentId));
  // Deny-by-default: the exporter sees no more than the caller's own scope.
  if (opts.actor) {
    const m = getModule(plan.moduleKey);
    if (!m) return [];
    where.push(scopeFilter(opts.actor, m, opts.cycleId));
  }

  const rows = await db
    .select({
      data: records.data,
      ownerUserId: records.ownerUserId,
      ownerName: users.name,
      department: departments.name,
    })
    .from(records)
    .innerJoin(users, eq(users.id, records.ownerUserId))
    .leftJoin(departments, eq(departments.id, records.departmentId))
    .where(and(...where))
    .orderBy(records.periodYear, records.createdAt);

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
          eq(records.cycleId, opts.cycleId),
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

  return filtered.map((r) => ({
    data: r.data as Record<string, unknown>,
    ownerName: r.ownerName,
    department: r.department ?? '',
    profile: profiles.get(r.ownerUserId) ?? {},
  }));
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
  if (raw === undefined || raw === null || raw === '') return '';

  if (field?.pii === 'encrypted') {
    return presentPii(raw, field.type === 'pan' ? 'pan' : 'aadhaar', ctx);
  }

  if (field?.type === 'money') {
    const n = digits(raw);
    const divisor = plan.divideBy?.[fieldKey] ?? 1;
    return divisor === 1 ? n : n / divisor;
  }

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
  workbookKey: WorkbookKey, opts: ExportOptions, loadRows: RowLoader, ctx: PiiContext,
): Promise<ExportResult> {
  const mode: ExportMode = hasTemplate(workbookKey) ? 'template' : 'generated';
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DARP — BIT Mesra';
  wb.created = new Date();

  if (mode === 'template') {
    // Read-only: the file on disk is never written back.
    await wb.xlsx.readFile(templatePath(workbookKey));
  }

  const plans = buildPlans().filter((p) => p.workbook === workbookKey);
  const problems: string[] = [];
  let sheetsWritten = 0;
  let rowsWritten = 0;

  for (const plan of plans) {
    const allHeaders = plannedHeaders(plan);
    const sheet = mode === 'generated'
      ? ensureGeneratedSheet(wb, plan)
      : wb.getWorksheet(plan.sheet);
    if (!sheet) {
      problems.push(`sheet "${plan.sheet}" not found in ${workbookKey}.xlsx`);
      continue;
    }

    const headerRow = mode === 'generated' ? 1 : findHeaderRow(sheet, allHeaders);
    if (!headerRow) {
      problems.push(`header row not found for ${plan.moduleKey} in ${plan.sheet}`);
      continue;
    }

    const index = headerIndex(sheet, headerRow);
    for (const header of allHeaders) {
      if (!index.has(norm(header))) {
        // Loud by design: a mismapped column must never be discovered by the accreditation cell.
        problems.push(`column "${header}" missing from ${workbookKey}/${plan.sheet}`);
      }
    }

    const rows = await loadRows(plan);
    let writeAt = firstEmptyRowAfter(sheet, headerRow);
    let serial = 1;

    for (const r of rows) {
      const row = sheet.getRow(writeAt++);

      for (const col of plan.columns) {
        const at = index.get(norm(col.header));
        if (!at) continue;
        row.getCell(at).value = await renderValue(plan, col.fieldKey, r, ctx);
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
        else if (col.kind === 'amountInWords') {
          row.getCell(at).value = amountInWords(digits(r.data.earnings));
        }
      }

      row.commit();
      serial += 1;
      rowsWritten += 1;
    }

    // Summary cells: the value goes in the cell immediately right of its label.
    for (const cell of plan.summaryCells ?? []) {
      const total = rows.reduce((sum, r) => sum + digits(r.data[cell.fieldKey]), 0);
      const found = findLabelCell(sheet, cell.label);
      if (found) {
        sheet.getRow(found.row).getCell(found.col + 1).value = total;
      } else if (mode === 'generated') {
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

    sheetsWritten += 1;
  }

  if (problems.length) {
    log.error('export mapping problems', { workbookKey, mode, problems });
    throw new Error(`Export mapping failed:\n- ${problems.join('\n- ')}`);
  }

  return { workbook: wb, mode, piiRevealed: ctx.revealed, sheetsWritten, rowsWritten };
}

/** The real export: exportable records only, straight from the database. */
export async function generateWorkbook(
  workbookKey: WorkbookKey, opts: ExportOptions,
): Promise<ExportResult> {
  const ctx: PiiContext = { includePii: opts.includePii, revealed: 0 };
  return writeWorkbook(workbookKey, opts, (plan) => fetchExportRows(plan, opts, ctx), ctx);
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
