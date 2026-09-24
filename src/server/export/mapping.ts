import 'server-only';
import type { ModuleConfig, RecordStatus, WorkbookKey } from '@/modules/_types';
import { MODULE_LIST } from '@/modules';

export const WORKBOOK_KEYS: WorkbookKey[] = ['faculty', 'drie', 'dofa', 'dugs', 'hod', 'cdc'];

/**
 * Only verified and approved records are exported (00 §0.8). Drafts, submitted and returned
 * records never reach the accreditation cell.
 *
 * Doc 07 imports this from `@/server/rollups/compute`; that module does not exist yet, so the
 * single source of truth lives here for now and the rollup layer can re-export it.
 */
export const EXPORTABLE_STATUSES: RecordStatus[] = ['verified', 'approved'];

export type SystemColumnKind = 'serial' | 'ownerName' | 'department' | 'amountInWords';

export interface SheetPlan {
  workbook: WorkbookKey;
  sheet: string;
  moduleKey: string;
  /** Only export records whose field matches — used where one sheet holds two tables. */
  rowFilter?: { field: string; in: string[] };
  /** field key → exact column header text in that sheet. */
  columns: Array<{ fieldKey: string; header: string }>;
  /** Fields pulled from the owner's profile rather than the record itself. */
  fromProfile?: Array<{ profileFieldKey: string; header: string }>;
  /** Divide a money field by this before writing (Seed Money is recorded in lakhs). */
  divideBy?: Record<string, number>;
  /**
   * Columns the sheet asks for but the portal never collects, because it already
   * knows them: the row number, the owner's name, the department.
   */
  systemColumns?: Array<{ header: string; kind: SystemColumnKind }>;
  /** A single summary cell: the value is written into the cell to the RIGHT of the label. */
  summaryCells?: Array<{ label: string; kind: 'sum'; fieldKey: string }>;
}

/**
 * The "System columns" from doc 04, with the header text exactly as it appears in the
 * workbook. Whitespace is normalised when matching, so a single space here matches a
 * double space in the sheet.
 */
const SYSTEM_COLUMNS: Record<string, SheetPlan['systemColumns']> = {
  publications: [
    { header: 'Serial No.', kind: 'serial' },
    { header: 'Department of the teacher', kind: 'department' },
  ],
  books: [
    { header: 'Sl. No.', kind: 'serial' },
    { header: 'Name of the teacher', kind: 'ownerName' },
  ],
  grants: [
    { header: 'S.No', kind: 'serial' },
    { header: 'Name of the faculty', kind: 'ownerName' },
  ],
  seedmoney: [
    { header: 'S.No', kind: 'serial' },
    { header: 'Name of the faculty recipient of Seed Money', kind: 'ownerName' },
  ],
  fellowships: [
    {
      header: 'Name of the teacher received the national/ international fellowship/financial support /international travel grant',
      kind: 'ownerName',
    },
  ],
  awards: [
    {
      header: 'Name of full time teachers receiving awards from state level,national level, international level',
      kind: 'ownerName',
    },
  ],
  finsupport: [{ header: 'Name of the teacher', kind: 'ownerName' }],
  fdpattended: [{ header: 'Name of the Faculty', kind: 'ownerName' }],
  econtent: [{ header: 'Name of the teacher', kind: 'ownerName' }],
  qscontacts: [{ header: 'Serial No.', kind: 'serial' }],
  edpmdp: [
    { header: 'Department', kind: 'department' },
    { header: 'Total annual earnings in words', kind: 'amountInWords' },
  ],
};

function columnsFor(m: ModuleConfig, workbook: WorkbookKey) {
  return m.fields
    .filter((f) => f.exportAs?.[workbook])
    .map((f) => ({ fieldKey: f.key, header: f.exportAs![workbook]! }));
}

/** One plan per (module, workbook, sheet). Built from the configs, with the exceptions below. */
export function buildPlans(): SheetPlan[] {
  const plans: SheetPlan[] = [];

  for (const m of MODULE_LIST) {
    for (const target of m.exportTargets) {
      plans.push({
        workbook: target.workbook,
        sheet: target.sheet,
        moduleKey: m.key,
        columns: columnsFor(m, target.workbook),
        systemColumns: SYSTEM_COLUMNS[m.key],
      });
    }
  }

  /* ── Exceptions the configs cannot express ─────────────────────────── */

  // 1. Consultancy: one sheet, two tables. The config's exportAs carries the
  //    consultancy table; the corporate-training table is mapped here.
  const consultancyPlans = plans.filter((p) => p.moduleKey === 'consultancy');
  for (const p of consultancyPlans) {
    p.rowFilter = { field: 'recordType', in: ['Consultancy'] };
    // 4. Summary cells the sheets total by hand today.
    p.summaryCells = [{
      label: 'Total amount generated from consultancy and corporate training (INR)',
      kind: 'sum',
      fieldKey: 'revenue',
    }];
    plans.push({
      workbook: p.workbook,
      sheet: p.sheet,
      moduleKey: 'consultancy',
      rowFilter: { field: 'recordType', in: ['Corporate training'] },
      columns: [
        { fieldKey: 'consultants', header: 'Names of the teacher-consultants/corporate trainers' },
        { fieldKey: 'projectTitle', header: 'Title of the corporate training program' },
        { fieldKey: 'agency', header: 'Agency seeking training with contact details' },
        { fieldKey: 'financialYear', header: 'Year (Financial years 2024, 2023, 2022)' },
        { fieldKey: 'revenue', header: 'Revenue generated (amount in rupees)' },
        { fieldKey: 'numberOfTrainees', header: 'Number of trainees' },
        {
          fieldKey: 'evidence',
          header: 'Attach document (Letter from corporate to whom training was imparted along with fee paid)',
        },
      ],
    });
  }

  // 2. Seed money is recorded in whole rupees but the sheet's column says lakhs.
  for (const p of plans.filter((p) => p.moduleKey === 'seedmoney')) {
    p.divideBy = { amount: 100000 };
  }

  // 3. The Awards sheet asks for PAN and Designation, which live on the Faculty Profile.
  //    They are read from the record owner's profile instead of being collected twice.
  for (const p of plans.filter((p) => p.moduleKey === 'awards')) {
    p.fromProfile = [
      { profileFieldKey: 'pan', header: 'PAN' },
      { profileFieldKey: 'designation', header: 'Designation' },
    ];
  }

  return plans;
}

/** Every header a plan writes, in the order a generated sheet lays them out. */
export function plannedHeaders(plan: SheetPlan): string[] {
  return [
    ...(plan.systemColumns ?? []).map((c) => c.header),
    ...plan.columns.map((c) => c.header),
    ...(plan.fromProfile ?? []).map((c) => c.header),
  ];
}

/** Whitespace-insensitive, case-insensitive header matching. */
export function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Indian numbering, used for the EDP/MDP sheet's "earnings in words" cell. */
export function amountInWords(rupees: number): string {
  if (!Number.isFinite(rupees) || rupees <= 0) return '';
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen',
    'Nineteen',
  ];
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
  ];

  const under100 = (n: number): string =>
    n < 20 ? ones[n]! : `${tens[Math.floor(n / 10)]!}${n % 10 ? ` ${ones[n % 10]!}` : ''}`;

  const whole = Math.floor(rupees);
  const parts: string[] = [];
  const push = (value: number, unit: string) => {
    if (value) parts.push(`${under100(value)} ${unit}`);
  };

  push(Math.floor(whole / 10000000), 'Crore');
  push(Math.floor((whole % 10000000) / 100000), 'Lakh');
  push(Math.floor((whole % 100000) / 1000), 'Thousand');
  push(Math.floor((whole % 1000) / 100), 'Hundred');
  const rest = whole % 100;
  if (rest) parts.push(under100(rest));

  if (parts.length === 0) return '';
  return `Rupees ${parts.join(' ')} only`;
}
