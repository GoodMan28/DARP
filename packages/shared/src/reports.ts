// Reports: the formats IQAC and the offices download, and the choices offered for them.
import type { PeriodType, WorkbookKey } from './modules/_types';

export type ReportFormatKey = 'naac' | 'full' | 'nirf' | 'nba';

export interface ReportFormatInfo {
  key: ReportFormatKey;
  name: string;
  about: string;
  /** False until IQAC provides the format file: shown, but cannot be chosen. */
  ready: boolean;
}

export const REPORT_FORMATS: ReportFormatInfo[] = [
  { key: 'naac', name: 'IQAC formats', ready: true,
    about: 'IQAC’s own Excel files (Faculty format, DRIE, DoFA, DUGS, HODs, CDC), filled in, in their own layout and wording.' },
  { key: 'full', name: 'Full data', ready: true,
    about: 'Every field of every module you can see, one sheet per module, for IQAC’s own analysis.' },
  { key: 'nirf', name: 'NIRF Data Capture', ready: false,
    about: 'Needs the NIRF Data Capture format file from IQAC before it can be built.' },
  { key: 'nba', name: 'NBA SAR', ready: false,
    about: 'Needs the NBA Self Assessment Report format from IQAC before it can be built.' },
];

/** The six format files, named as IQAC names them. */
export const WORKBOOK_INFO: ReadonlyArray<{ key: WorkbookKey; name: string; office: string; contents: string }> = [
  { key: 'faculty', name: 'Faculty format', office: 'each faculty member', contents: 'The Profile form (one column per person, with the counted figures) and every sheet a faculty member fills' },
  { key: 'drie', name: 'DRIE one-time format', office: 'DRIE', contents: 'Publications, patents, books, grants, consultancy, fellowships, seed money, research awards, MoUs' },
  { key: 'dofa', name: 'DoFA one-time format', office: 'DoFA', contents: 'Students guided, awards, financial support, FDPs, QS contacts, quality activities' },
  { key: 'dugs', name: 'DUGS / DPGS one-time format', office: 'DUGS / DPGS', contents: 'Mentorship and e-content' },
  { key: 'hod', name: 'HODs format', office: 'Heads of department', contents: 'Student workshops, curriculum feedback, MoUs, FDPs organised, EDP/MDP revenue, research awards' },
  { key: 'cdc', name: 'College Dev Council one-time format', office: 'CDC', contents: 'Students qualifying NET, GATE, CAT and other examinations' },
];

/** 'auto': each sheet in its own year type (publications by calendar year, grants by financial year…). */
export type ReportYearType = 'auto' | PeriodType;

export const YEAR_TYPE_LABEL: Record<ReportYearType, string> = {
  auto: 'As each sheet needs (recommended)',
  CY: 'Calendar years (Jan–Dec)',
  FY: 'Financial years (Apr–Mar)',
  AY: 'Academic years (Jul–Jun)',
};

/** GET /api/reports/options: what this person may download, and the choices to offer. */
export interface ReportOptions {
  formats: ReportFormatInfo[];
  /** NAAC workbooks this person may download. */
  workbooks: Array<{ key: WorkbookKey; name: string; office: string; contents: string }>;
  /** For Full data: the modules whose records this person oversees. */
  modules: Array<{ key: string; name: string; periodType: PeriodType }>;
  /** Departments to choose from; a HOD gets only their own, fixed. */
  departments: Array<{ id: string; name: string }>;
  departmentFixed: boolean;
  /** Whose records: the person's own (faculty), their department's (HOD), or everyone's (offices, IQAC). */
  scope: 'self' | 'department' | 'all';
  range: { from: number; to: number };
  years: { min: number; max: number };
  canRevealPii: boolean;
}

/** GET /api/reports/:format/summary: the rows each sheet would hold, before downloading. */
export interface ReportSummary {
  sheets: Array<{
    sheet: string; moduleKey: string; moduleName: string; yearType: PeriodType; rows: number;
    /** False for a sheet not filtered by year (the Faculty Profile: one per person). */
    dated: boolean;
    /** The table, when a sheet holds two (Consultancy: "Corporate training"). */
    part: string | null;
  }>;
  rows: number;
}
