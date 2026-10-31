import type { ModuleConfig, RecordStatus, WorkbookKey } from '@darp/shared/modules/types';
import { MODULE_LIST } from '@darp/shared/modules';

export const WORKBOOK_KEYS: WorkbookKey[] = ['faculty', 'drie', 'dofa', 'dugs', 'hod', 'cdc'];

/**
 * Only verified and approved records are exported (00 §0.8). Drafts, submitted and returned
 * records never reach the accreditation cell.
 *
 * Doc 07 imports this from `@/server/rollups/compute`; that module does not exist yet, so the
 * single source of truth lives here for now and the rollup layer can re-export it.
 */
export const EXPORTABLE_STATUSES: RecordStatus[] = ['verified', 'approved'];

export type SystemColumnKind = 'serial' | 'ownerName' | 'department' | 'amountInWords' | 'period';

export interface SheetPlan {
  /** 'full': a sheet of the Full data report, every field of one module. */
  workbook: WorkbookKey | 'full';
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
  /** Write dates as dates, even where a workbook template asks for the year alone (Full data). */
  rawDates?: boolean;
  /**
   * How the format file lays the sheet out, when it is not a table with one row per record:
   *  - 'profileForm'        the Faculty Profile: a label in column A, each person's answers in the next column
   *  - 'columnsPerRecord'   EDP-MDP: labels down a column, one column per record (per financial year)
   *  - 'feedbackGrid'       Curriculum Feedback: Yes/No under each classification, links below
   * Only a format file uses these; a sheet DARP builds itself is always a table.
   */
  layout?: 'table' | 'profileForm' | 'columnsPerRecord' | 'feedbackGrid';
}

/**
 * The Faculty Profile form's figures, by the start of each row's label in the format file. Rows 2–23
 * are the profile's own fields (matched by their exportAs label); these are the rest: what the
 * person declared, and what DARP counts from their records for the report's years.
 */
export const PROFILE_FORM_FIGURES: ReadonlyArray<{ starts: string; key: string; yesNo?: boolean }> = [
  { starts: 'Number of national seminars attended since joining BIT', key: 'manual.seminars.national.sinceJoining' },
  { starts: 'Number of national seminars attended last year', key: 'manual.seminars.national.cycle' },
  { starts: 'Number of international seminars attended since joining BIT', key: 'manual.seminars.international.sinceJoining' },
  { starts: 'Number of international seminars attended last year', key: 'manual.seminars.international.cycle' },
  { starts: 'Number of workshops and conferences attended since joining BIT', key: 'manual.workshops.attended.sinceJoining' },
  { starts: 'Number of workshops and conferences attended last year', key: 'manual.workshops.attended.cycle' },
  { starts: 'How many foreign universities visited since joining BIT', key: 'manual.foreignVisits.count.sinceJoining' },
  { starts: 'Did you visit any foreign university last year', key: 'manual.foreignVisits.lastYear', yesNo: true },
  { starts: 'Total no. of research papers presented in national conferences since joining BIT', key: 'manual.papersPresented.national.sinceJoining' },
  { starts: 'No. of reasearch papers presented in national conferences last year', key: 'manual.papersPresented.national.cycle' },
  { starts: 'No. of research papers presented in international conferences since joining BIT', key: 'manual.papersPresented.international.sinceJoining' },
  { starts: 'No. of research papers presented in international conferences last year', key: 'manual.papersPresented.international.cycle' },
  { starts: 'No. of UG students guided since joining BIT', key: 'studentsguided.count.ug.sinceJoining' },
  { starts: 'No. of PG students guided since joining BIT', key: 'studentsguided.count.pg.sinceJoining' },
  { starts: 'No. of PHD students guided since joining BIT', key: 'studentsguided.count.phd.sinceJoining' },
  { starts: 'No. of UG students guided in AY', key: 'studentsguided.count.ug.cycle' },
  { starts: 'No. of PG students guided in AY', key: 'studentsguided.count.pg.cycle' },
  { starts: 'No. of PHD students guided in AY', key: 'studentsguided.count.phd.cycle' },
  { starts: 'Total seed money received since joining BIT', key: 'seedmoney.sum.sinceJoining' },
  { starts: 'No. of Awards from state, national and international agencies received since joining BIT', key: 'awards.count.sinceJoining' },
  { starts: 'No. of Awards from state, national and international agencies received from', key: 'awards.count.cycle' },
  { starts: 'No. of Awards for "Research and Innovation" received since joining BIT', key: 'riawards.count.sinceJoining' },
  { starts: 'No. of Awards for "Research and Innovation" received from', key: 'riawards.count.cycle' },
  { starts: 'No. of Awards for "Extension Activities" received since joining BIT', key: 'extawards.count.sinceJoining' },
  { starts: 'No. of Awards for "Extension Activities" received from', key: 'extawards.count.cycle' },
  { starts: 'No. of Patents Published since joining BIT', key: 'patents.count.published.sinceJoining' },
  { starts: 'No. of Patents Published from', key: 'patents.count.published.cycle' },
  { starts: 'No. of Patents Awarded since joining BIT', key: 'patents.count.granted.sinceJoining' },
  { starts: 'No. of Patents Awarded from', key: 'patents.count.granted.cycle' },
  { starts: 'No. of publications since joining BIT', key: 'publications.count.sinceJoining' },
  { starts: 'No. of publications from', key: 'publications.count.cycle' },
  { starts: 'No. of Books published since joining BIT', key: 'books.count.book.sinceJoining' },
  { starts: 'No. of Books published from', key: 'books.count.book.cycle' },
  { starts: 'No. of Book Chapters published since joining BIT', key: 'books.count.chapter.sinceJoining' },
  { starts: 'No. of Book Chapters published from', key: 'books.count.chapter.cycle' },
  { starts: 'No. of modules developed on these platforms since joining BIT', key: 'econtent.count.sinceJoining' },
  { starts: 'No. of modules developed on these platforms from', key: 'econtent.count.cycle' },
  { starts: 'No. of consultancy projects awarded since joining BIT', key: 'consultancy.count.consultancy.sinceJoining' },
  { starts: 'Revenue generated from consultancy projects since joining BIT', key: 'consultancy.sum.consultancy.sinceJoining' },
  { starts: 'No. of consultancy projects awarded from', key: 'consultancy.count.consultancy.cycle' },
  { starts: 'Revenue generated from consultancy projects from', key: 'consultancy.sum.consultancy.cycle' },
  { starts: 'No. of corporate training programs conducted since joining BIT', key: 'consultancy.count.training.sinceJoining' },
  { starts: 'Revenue generated from corporate training since joining BIT', key: 'consultancy.sum.training.sinceJoining' },
  { starts: 'No. of corporate training programs conducted from', key: 'consultancy.count.training.cycle' },
  { starts: 'Revenue generated from corporate training from', key: 'consultancy.sum.training.cycle' },
  { starts: 'No. of times fellowship/financial support for advanced studies/research and international travel grant received since joining BIT', key: 'fellowships.count.sinceJoining' },
  { starts: 'Amount of fellowship/financial support for advanced studies/research and international travel grant received since joining BIT', key: 'fellowships.sum.sinceJoining' },
  { starts: 'No. of times fellowship/financial support for advanced studies/research and international travel grant received from', key: 'fellowships.count.cycle' },
  { starts: 'Amount of fellowship/financial support for advanced studies/research and international travel grant received from', key: 'fellowships.sum.cycle' },
  { starts: 'No. of times financial support to attend conferences', key: 'finsupport.count.cycle' },
  { starts: 'Amount of financial support to attend conferences', key: 'finsupport.sum.cycle' },
  { starts: 'Faculty Development Programmes (FDP)/Management Development Programs (MDPs)/Professional Development Programmes/Refresher courses/Short Term Courses attended since joining BIT', key: 'fdpattended.count.sinceJoining' },
  { starts: 'Faculty Development Programmes (FDP)/Management Development Programs (MDPs)/Professional Development Programmes/Refresher courses/Short Term Courses attended from', key: 'fdpattended.count.cycle' },
  { starts: 'No. of research projects granted since joining BIT (as PI)', key: 'grants.count.pi.sinceJoining' },
  { starts: 'No. of research projects granted from FY 2022-23 to 2024-25 (as PI)', key: 'grants.count.pi.cycle' },
  { starts: 'Total sanctioned amount of research projects granted since joining BIT (as PI)', key: 'grants.sum.pi.sinceJoining' },
  { starts: 'Total sanctioned amount of research projects granted from FY 2022-23 to 2024-25 (calendar years) (as PI)', key: 'grants.sum.pi.cycle' },
  { starts: 'No. of research projects granted since joining BIT (as Co-PI)', key: 'grants.count.copi.sinceJoining' },
  { starts: 'No. of research projects granted from FY 2022-23 to 2024-25 (as Co-PI)', key: 'grants.count.copi.cycle' },
  { starts: 'Total sanctioned amount of research projects granted since joining BIT (as Co-PI)', key: 'grants.sum.copi.sinceJoining' },
  { starts: 'Total sanctioned amount of research projects granted from FY 2022-23 to 2024-25 (calendar years) (as Co-PI)', key: 'grants.sum.copi.cycle' },
  { starts: 'Total No. of active research collaborators', key: 'manual.collaborators.active' },
];

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
  outreach: [{ header: 'Name of the teacher', kind: 'ownerName' }],
  econtent: [{ header: 'Name of the teacher', kind: 'ownerName' }],
  qscontacts: [{ header: 'Serial No.', kind: 'serial' }],
  edpmdp: [
    { header: 'Department', kind: 'department' },
    { header: 'Total annual earnings in words', kind: 'amountInWords' },
  ],
};

/** A derived column (the journal's ranking) in a plan: worked out when exported, not read from the record. */
export const DERIVED_PREFIX = 'derived:';

function columnsFor(m: ModuleConfig, workbook: WorkbookKey) {
  return [
    ...m.fields
      .filter((f) => f.exportAs?.[workbook])
      .map((f) => ({ fieldKey: f.key, header: f.exportAs![workbook]! })),
    ...(m.derived ?? [])
      .filter((d) => d.exportAs?.[workbook])
      .map((d) => ({ fieldKey: `${DERIVED_PREFIX}${d.key}`, header: d.exportAs![workbook]! })),
  ];
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

  // The corporate-training table's year column is headed as the consultancy table's is, sheet by sheet
  // (the faculty workbook says "Year (Financial years …)", DRIE's says "Financial year").
  for (const p of plans.filter((x) => x.moduleKey === 'consultancy' && x.rowFilter?.in.includes('Corporate training'))) {
    const own = consultancyPlans.find((c) => c.workbook === p.workbook)?.columns.find((c) => c.fieldKey === 'financialYear');
    const year = p.columns.find((c) => c.fieldKey === 'financialYear');
    if (own && year) year.header = own.header;
  }

  // Sheets the format files lay out other than as a table.
  for (const p of plans) {
    if (p.moduleKey === 'profile') p.layout = 'profileForm';
    if (p.moduleKey === 'edpmdp') p.layout = 'columnsPerRecord';
    if (p.moduleKey === 'feedback') p.layout = 'feedbackGrid';
  }

  // Student Workshops: Table A lists the programmes; Table B beside it holds four totals, each
  // written to the right of its question.
  for (const p of plans.filter((x) => x.moduleKey === 'workshops')) {
    const totals = ['liveProjects', 'ethicsEvents', 'industryGuestSpeakers', 'studentsInResearchCount'];
    const inB = p.columns.filter((c) => totals.includes(c.fieldKey) || /:\s*$/.test(c.header));
    p.columns = p.columns.filter((c) => !inB.includes(c));
    p.summaryCells = [...(p.summaryCells ?? []), ...inB.map((c) => ({ label: c.header, kind: 'sum' as const, fieldKey: c.fieldKey }))];
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

/** A worksheet name Excel accepts: at most 31 characters, none of : \\ / ? * [ ]. */
function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31).trim();
  let out = base;
  for (let n = 2; used.has(out.toLowerCase()); n += 1) out = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  used.add(out.toLowerCase());
  return out;
}

/**
 * The Full data report: one sheet per module, with who entered it, the department, the year (in the
 * year type asked for) and then every field and worked-out column, headed by its form label.
 */
export function fullPlans(modules: ModuleConfig[]): SheetPlan[] {
  const used = new Set<string>();
  return modules.map((m) => {
    const system: NonNullable<SheetPlan['systemColumns']> = [
      { header: 'S. No.', kind: 'serial' },
      { header: m.scope === 'self' ? 'Name' : 'Entered by', kind: 'ownerName' },
      { header: 'Department', kind: 'department' },
      { header: 'Year', kind: 'period' },
    ];
    const seen = new Set(system.map((c) => norm(c.header)));
    const unique = (h: string) => {
      let out = h;
      for (let n = 2; seen.has(norm(out)); n += 1) out = `${h} (${n})`;
      seen.add(norm(out));
      return out;
    };
    return {
      workbook: 'full',
      sheet: sheetName(m.name, used),
      moduleKey: m.key,
      systemColumns: system,
      rawDates: true,
      columns: [
        ...m.fields.map((f) => ({ fieldKey: f.key, header: unique(f.label) })),
        ...(m.derived ?? []).map((d) => ({ fieldKey: `${DERIVED_PREFIX}${d.key}`, header: unique(d.label) })),
      ],
    };
  });
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
