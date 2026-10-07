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

/** Facts an external register can supply. Field configs name the one they take. */
export type MetaKey =
  | 'doi' | 'title' | 'authors' | 'containerTitle' | 'issn' | 'year' | 'volume' | 'issue' | 'pages'
  | 'publisher' | 'workType' | 'quartile' | 'quartileSource' | 'indexing' | 'citation'
  | 'bookType' | 'bookTitle' | 'chapterTitle' | 'isbn';

/** Which register a module's records are fetched from. */
export type LookupKind = 'doi' | 'book';

export interface LookupConfig {
  kind: LookupKind;
  /** Fields the identifier may live in, in priority order; the first non-empty one is used. */
  idFields: string[];
  /** Label of the identifier box on the form, e.g. 'DOI'. */
  idLabel: string;
  /**
   * When a submitted record is approved without a human (server/lookup/apply.ts):
   *  - 'always'          every submission is approved at once. Whatever could not be confirmed
   *                      becomes a "point to check" that the verifying office and IQAC see, and
   *                      they may return the approved record. A returned record, resubmitted,
   *                      goes to the verifying office instead (no second automatic approval).
   *  - 'whenChecksPass'  approved only when every automatic check passes; otherwise reviewed.
   */
  autoApprove: 'always' | 'whenChecksPass';
  /** Crossref work types that count as confirmed. Anything else becomes a point to check. */
  acceptTypes: string[];
  /** The owner's name must appear in this field (the author list) before the record can be submitted. */
  ownerMustBeIn?: string;
  /** This file field becomes required on submit whenever any detail could not be confirmed. */
  evidenceField?: string;
  /**
   * Refuse to submit a record whose year falls outside the reporting cycle (e.g. a 2020 paper in
   * the 2022–2024 cycle), instead of approving it with a point to check. Drafts are not affected.
   */
  refuseOutsideCycle?: boolean;
}

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
  /**
   * Filled from the fetched record. `locked: true` means the owner cannot change it once a lookup
   * succeeded: the server overwrites it with the fetched value on every save.
   */
  autofill?: {
    from: MetaKey;
    locked: boolean;
    /**
     * Never typed by hand, even when nothing was fetched — for a field that states where a value
     * came from (e.g. "SJR 2023 · Scopus list"), where a typed value would be a false claim.
     */
    alwaysLocked?: boolean;
  };
  /** Server-side normalisation that needs other fields of the record. */
  normalise?: 'patentNumber';
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

  /** Fetch this module's facts from an external register (DOI, ISBN). */
  lookup?: LookupConfig;

  fields: FieldConfig[];
  listColumns: string[];          // field keys shown in the table
  defaultSort?: { key: string; dir: 'asc' | 'desc' };

  /** Which original workbook sheets this module exports into. */
  exportTargets: Array<{ workbook: WorkbookKey; sheet: string }>;

  /** Profile counter keys this module feeds (see 06-rollups-dashboard.md). */
  feedsCounters?: string[];
}
