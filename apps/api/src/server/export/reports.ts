import { asc } from 'drizzle-orm';
import type { ModuleConfig, Role, WorkbookKey } from '@darp/shared/modules/types';
import { MODULE_LIST, getModule } from '@darp/shared/modules';
import {
  REPORT_FORMATS, WORKBOOK_INFO, YEAR_TYPE_LABEL, type ReportFormatKey, type ReportOptions, type ReportSummary, type ReportYearType,
} from '@darp/shared/reports';
import { db } from '@/server/db';
import { departments } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { hasCapability } from '@/server/auth/permissions';
import { ServiceError } from '@/server/records/service';
import { defaultRange, parseRange, MIN_YEAR, type YearRange } from '@/server/records/range';
import { labelFor } from '@/server/records/periods';
import { WORKBOOK_KEYS, buildPlans, fullPlans, type SheetPlan } from './mapping';
import { generateWorkbook, countExportRows, yearTypeFor, type ExportOptions, type ExportResult } from './excel';

/**
 * Which workbooks each level may download: its own format, and the Faculty format for the people
 * and modules it looks after (a faculty member their own; a HOD their department's; DoFA, DRIE and
 * DUGS the sheets of their own modules, for every faculty member). IQAC may download all.
 */
export const ALLOWED_WORKBOOKS: Record<Role, WorkbookKey[]> = {
  admin: WORKBOOK_KEYS,
  drie: ['drie', 'faculty'],
  dofa: ['dofa', 'faculty'],
  dugs: ['dugs', 'faculty'],
  cdc: ['cdc'],
  hod: ['hod', 'faculty'],
  faculty: ['faculty'],
};

/**
 * The modules whose records a person reports on: IQAC all; a faculty member the modules they fill
 * in (their own records, by scope); a HOD those it views or owns (its department's, by scope); an
 * office the modules it verifies or views, and those it keeps for the whole institute.
 */
export function reportModules(actor: SessionUser): ModuleConfig[] {
  if (actor.role === 'admin') return MODULE_LIST;
  if (actor.role === 'faculty') return MODULE_LIST.filter((m) => m.ownerRoles.includes('faculty'));
  return MODULE_LIST.filter((m) => m.verifierRoles.includes(actor.role) || m.viewRoles.includes(actor.role)
    || (m.ownerRoles.includes(actor.role) && m.scope !== 'self'));
}

/** Whose records a report holds: the person's own, their department's, or everyone's in its modules. */
export function reportScope(actor: SessionUser): 'self' | 'department' | 'all' {
  return actor.role === 'faculty' ? 'self' : actor.role === 'hod' ? 'department' : 'all';
}

/** What this person may download and the choices to offer. */
export async function reportOptions(actor: SessionUser): Promise<ReportOptions> {
  if (!hasCapability(actor, 'export')) throw new ServiceError('FORBIDDEN', 'Reports are not available to your account.');
  const range = await defaultRange();
  const all = await db.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.name));
  const scope = reportScope(actor);
  return {
    formats: REPORT_FORMATS,
    // The office's own format first, then the Faculty format.
    workbooks: ALLOWED_WORKBOOKS[actor.role].map((k) => WORKBOOK_INFO.find((w) => w.key === k)!),
    modules: reportModules(actor).map((m) => ({ key: m.key, name: m.name, periodType: m.periodType })),
    departments: scope === 'all' ? all : all.filter((d) => d.id === actor.departmentId),
    departmentFixed: scope !== 'all',
    scope,
    range: { from: range.from, to: range.to },
    years: { min: Math.max(MIN_YEAR, 2000), max: new Date().getUTCFullYear() + 1 },
    canRevealPii: hasCapability(actor, 'revealPii'),
  };
}

export interface ReportRequest {
  format: ReportFormatKey;
  /** NAAC only: which office's workbook. */
  workbook: WorkbookKey | null;
  range: YearRange;
  yearType: ReportYearType;
  departmentIds: string[] | null;
  moduleKeys: string[] | null;
  includePii: boolean;
  reason: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const list = (v: string | null) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Reads and checks a report's query string. Anything this person may not ask for is refused, not widened. */
export function readReportRequest(actor: SessionUser, format: string, sp: URLSearchParams): ReportRequest {
  if (!hasCapability(actor, 'export')) throw new ServiceError('FORBIDDEN', 'Reports are not available to your account.');
  const info = REPORT_FORMATS.find((f) => f.key === format);
  if (!info) throw new ServiceError('NOT_FOUND', 'There is no such report.');
  if (!info.ready) throw new ServiceError('VALIDATION', `${info.name}: the format has not been provided yet. Send IQAC's format file to the DARP team.`);

  let workbook: WorkbookKey | null = null;
  if (info.key === 'naac') {
    workbook = sp.get('workbook') as WorkbookKey | null;
    if (!workbook || !WORKBOOK_KEYS.includes(workbook)) throw new ServiceError('VALIDATION', 'Choose a workbook.');
    if (!ALLOWED_WORKBOOKS[actor.role].includes(workbook)) throw new ServiceError('FORBIDDEN', 'That workbook is not yours to download.');
  }

  const range = parseRange(sp.get('from'), sp.get('to'));
  if (!range) throw new ServiceError('VALIDATION', 'Choose a from year and a to year, the first no later than the second.');

  const yt = sp.get('yearType') ?? 'auto';
  if (!['auto', 'CY', 'FY', 'AY'].includes(yt)) throw new ServiceError('VALIDATION', 'Unknown year type.');

  let departmentIds: string[] | null = list(sp.get('departments')).filter((d) => UUID.test(d));
  // A head of department reports on their own department only, whatever was asked for; a faculty
  // member on their own records (scopeFilter keeps them to those).
  if (actor.role === 'hod') departmentIds = actor.departmentId ? [actor.departmentId] : ['00000000-0000-0000-0000-000000000000'];
  if (actor.role === 'faculty') departmentIds = [];
  if (departmentIds.length === 0) departmentIds = null;

  // Only modules this person looks after, in either format: an office downloading the Faculty
  // workbook gets the sheets of its own modules, not its own records in everyone else's.
  const allowedModules = new Set(reportModules(actor).map((m) => m.key));
  let moduleKeys: string[] | null = list(sp.get('modules')).filter((k) => getModule(k) && allowedModules.has(k));
  if (moduleKeys.length === 0) moduleKeys = null;

  const includePii = sp.get('includePii') === '1';
  const reason = (sp.get('reason') ?? '').trim().slice(0, 500);
  // Plaintext Aadhaar/PAN leaves the system only for IQAC, only with a stated reason.
  if (includePii && (!hasCapability(actor, 'revealPii') || reason.length < 10)) {
    throw new ServiceError('FORBIDDEN', 'A written reason is required to export unmasked personal data, and only IQAC may do it.');
  }
  return { format: info.key, workbook, range, yearType: yt as ReportYearType, departmentIds, moduleKeys, includePii, reason };
}

function plansOf(actor: SessionUser, q: ReportRequest): SheetPlan[] {
  const mine = new Set(reportModules(actor).map((m) => m.key));
  const plans = q.format === 'full'
    ? fullPlans(reportModules(actor))
    : buildPlans().filter((p) => p.workbook === q.workbook && mine.has(p.moduleKey));
  return plans.filter((p) => !q.moduleKeys || q.moduleKeys.includes(p.moduleKey));
}

function optionsOf(actor: SessionUser, q: ReportRequest): ExportOptions {
  return {
    actor, range: q.range, yearType: q.yearType, includePii: q.includePii,
    departmentIds: q.departmentIds, moduleKeys: q.moduleKeys,
  };
}

/** The rows each sheet would hold: the preview shown before downloading. */
export async function summariseReport(actor: SessionUser, q: ReportRequest): Promise<ReportSummary> {
  const plans = plansOf(actor, q);
  const counts = await countExportRows(plans, optionsOf(actor, q));
  const sheets = plans.map((p, i) => {
    const m = getModule(p.moduleKey)!;
    return {
      sheet: p.sheet, moduleKey: m.key, moduleName: m.name, yearType: yearTypeFor(m.periodType, q.yearType), rows: counts[i] ?? 0,
      dated: m.periodic !== false, part: p.rowFilter ? p.rowFilter.in.join(', ') : null,
    };
  });
  return { sheets, rows: sheets.reduce((n, s) => n + s.rows, 0) };
}

/** "2022 to 2024": the range in each year type the report's sheets use. */
function rangeText(q: ReportRequest, plans: SheetPlan[]): string {
  const types = [...new Set(plans.map((p) => yearTypeFor(getModule(p.moduleKey)?.periodType ?? 'CY', q.yearType)))];
  return types.map((t) => `${labelFor(q.range.from, t)} to ${labelFor(q.range.to, t)}`).join(' · ');
}

/** The report as an Excel workbook, with a last sheet saying what it holds and how it was made. */
export async function generateReport(
  actor: SessionUser, q: ReportRequest, departmentNames: string[],
): Promise<ExportResult & { fileName: string }> {
  const plans = plansOf(actor, q);
  const result = await generateWorkbook(q.format === 'full' ? 'full' : q.workbook!, optionsOf(actor, q), plans);

  const about = result.workbook.addWorksheet('About this report');
  const info = REPORT_FORMATS.find((f) => f.key === q.format)!;
  const workbookName = q.workbook ? WORKBOOK_INFO.find((w) => w.key === q.workbook)?.name : null;
  const rows: Array<[string, string | number]> = [
    ['Report', workbookName ? `${info.name}: ${workbookName}` : info.name],
    ['Years', rangeText(q, plans)],
    ['Year type', q.yearType === 'auto' ? 'Each sheet in its own year type' : YEAR_TYPE_LABEL[q.yearType]],
    ['Departments', departmentNames.length ? departmentNames.join(', ') : 'All departments'],
    ['Records', 'Approved records only'],
    ['Rows written', result.rowsWritten],
    ['Made by', `${actor.name} on ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })}`],
  ];
  for (const [k, v] of rows) about.addRow([k, v]);
  about.getColumn(1).width = 16;
  about.getColumn(1).font = { bold: true };
  about.getColumn(2).width = 90;

  const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });   // YYYY-MM-DD, Indian date
  const what = q.format === 'full' ? 'full-data' : `naac-${q.workbook}`;
  return { ...result, fileName: `DARP-${what}-${q.range.from}-${q.range.to}-${stamp}.xlsx` };
}

/** The names of the chosen departments, for the report's About sheet and the audit trail. */
export async function departmentNamesOf(ids: string[] | null): Promise<string[]> {
  if (!ids) return [];
  const all = await db.select({ id: departments.id, name: departments.name }).from(departments);
  return all.filter((d) => ids.includes(d.id)).map((d) => d.name);
}
