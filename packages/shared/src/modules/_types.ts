export type Role = 'faculty' | 'hod' | 'dofa' | 'drie' | 'dugs' | 'cdc' | 'admin';

export type WorkbookKey = 'faculty' | 'drie' | 'dofa' | 'dugs' | 'hod' | 'cdc';

export type PeriodType = 'CY' | 'FY' | 'AY';

export type ModuleGroup =
  | 'Research' | 'Faculty' | 'Students' | 'Teaching' | 'Department' | 'Institution';

export type RecordStatus =
  | 'draft' | 'submitted' | 'verified' | 'approved' | 'returned';

export type FieldType =
  | 'text' | 'textarea' | 'select' | 'multiselect' | 'checkbox'
  | 'integer' | 'money'                 // money = whole rupees, stored as string of digits
  | 'date' | 'year'
  | 'email' | 'phone' | 'url'
  | 'doi' | 'issn' | 'isbn' | 'pan' | 'aadhaar'
  | 'file';

/** How a field is protected. 'encrypted' fields are AES-GCM at rest and never leave the
 *  server in plaintext except in an admin export. 'masked' fields are shown partially. */
export type PiiLevel = 'none' | 'masked' | 'encrypted';

export interface FieldConfig {
  key: string;                    // stored key inside records.data JSONB
  label: string;                  // exactly the workbook column wording where possible
  type: FieldType;
  required?: boolean;
  /** Master-list key for dropdowns that IQAC can edit at runtime. Takes priority over `options`. */
  listKey?: string;
  options?: string[];             // static dropdown values
  help?: string;                  // hint shown under the input
  placeholder?: string;
  min?: number;                   // integer/money/year lower bound
  max?: number;
  maxLength?: number;             // text/textarea
  /** Show this field only when another field has one of these values (conditional columns). */
  showIf?: { field: string; in: string[] };
  section?: string;               // groups fields into form sections
  colSpan?: 1 | 2;                // form layout, 2 = full width
  pii?: PiiLevel;                 // default 'none'
  /** Never include in list views, search indexes, logs or error messages. */
  sensitive?: boolean;
  accept?: string[];              // file: allowed extensions, e.g. ['pdf','jpg','png']
  maxSizeMB?: number;             // file: default 5
  /** Column header text in each original workbook sheet, used by the exporter. */
  exportAs?: Partial<Record<WorkbookKey, string>>;
}

export interface ModuleConfig {
  key: string;                    // canonical key from 00 §0.6
  name: string;
  group: ModuleGroup;
  periodType: PeriodType;
  naacRef?: string;               // e.g. '3.2.1'
  bodies: Array<'NAAC' | 'NIRF' | 'QS'>;
  description: string;            // one line shown at the top of the module

  ownerRoles: Role[];             // who may CREATE records
  verifierRoles: Role[];          // who may VERIFY (admin always may)
  viewRoles: Role[];              // who may READ all records in their scope
  /** 'self' = owned by one user; 'department' = owned by a department; 'institute' = one office. */
  scope: 'self' | 'department' | 'institute';

  /** Field keys forming the duplicate guard, unique per cycle. e.g. ['doi'] */
  naturalKey?: string[];

  /**
   * One record per owner per cycle, kept on its own page rather than added from the module list
   * (the Faculty Profile lives on /profile). The list then shows no "Add record" button and no nil
   * return; owners get a link to this page instead.
   */
  managedAt?: { href: string; label: string };

  fields: FieldConfig[];
  listColumns: string[];          // field keys shown in the table
  defaultSort?: { key: string; dir: 'asc' | 'desc' };

  /** Which original workbook sheets this module exports into. */
  exportTargets: Array<{ workbook: WorkbookKey; sheet: string }>;

  /** Profile counter keys this module feeds (see 06-rollups-dashboard.md). */
  feedsCounters?: string[];
}
