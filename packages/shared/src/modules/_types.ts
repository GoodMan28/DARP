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
  | 'decimal'                         // a number with at most one decimal place, e.g. 1.5 years
  | 'date' | 'year'
  | 'email' | 'phone' | 'url'
  | 'doi' | 'issn' | 'isbn' | 'pan' | 'aadhaar'
  | 'file';

/** How a field is protected. 'encrypted' fields are AES-GCM at rest and never leave the
 *  server in plaintext except in an admin export. 'masked' fields are shown partially. */
export type PiiLevel = 'none' | 'masked' | 'encrypted';

/** Facts an external register can supply. Field configs name the one they take. */
export type MetaKey =
  | 'doi' | 'title' | 'authors' | 'containerTitle' | 'issn' | 'year' | 'onlineYear' | 'volume' | 'issue' | 'pages'
  | 'publisher' | 'workType' | 'citation'
  | 'bookType' | 'bookTitle' | 'chapterTitle' | 'isbn' | 'eventName'
  // Patents (the Patent Office Journal)
  | 'inventors' | 'applicant' | 'country' | 'filedDate' | 'patentStatus' | 'statusDate';

/** Which register a module's records are fetched from. */
export type LookupKind = 'doi' | 'book' | 'patent';

export interface LookupConfig {
  kind: LookupKind;
  /** Fields the identifier may live in, in priority order; the first non-empty one is used. */
  idFields: string[];
  /** Label of the identifier box on the form, e.g. 'DOI'. */
  idLabel: string;
  /** What the fetched record is called in messages. Default "the publisher's record". */
  sourceName?: string;
  /** Who the owner must be among, in messages ("author", "inventor"). Default "author". */
  personWord?: string;
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
  /**
   * Work types that do not belong in this module and cannot be submitted here: they go to the
   * module named (the form offers to open it with the DOI filled in), or nowhere (null) — for
   * example a preprint, which has not been peer reviewed.
   */
  elsewhere?: Array<{ types: string[]; moduleKey: string | null }>;
  /** The owner's name must appear in this field (the author list) before the record can be submitted. */
  ownerMustBeIn?: string;
  /** This file field becomes required on submit whenever any detail could not be confirmed. */
  evidenceField?: string;
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
  maxSizeMB?: number;             // file: default 2
  /** Column header text in each original workbook sheet, used by the exporter. */
  exportAs?: Partial<Record<WorkbookKey, string>>;
  /**
   * Filled from the fetched record. `locked: true` shows it locked after a lookup; the owner may
   * still change it (after a warning), and the server records every change against the publisher's
   * value for the verifying office and IQAC to see.
   */
  autofill?: {
    from: MetaKey;
    locked: boolean;
    /**
     * Never typed by hand, even when nothing was fetched — for a field that states where a value
     * came from, where a typed value would be a false claim.
     */
    alwaysLocked?: boolean;
    /**
     * For an `alwaysLocked` field that says where another field's value came from: when the owner
     * changes or types that field, this one says so instead.
     */
    describes?: string;
  };
  /** A date or year that cannot be later than today (something that has already happened). */
  notFuture?: boolean;
  /** This date or year decides the record's reporting period (when a module has several dates). */
  periodSource?: boolean;
  /** Exports write the record's reporting year here instead of the date itself (the templates ask for a year). */
  exportYear?: boolean;
  /** Shown after a number input, e.g. 'years'. */
  unit?: string;
  /** Server-side normalisation that needs other fields of the record. */
  normalise?: 'patentNumber';
}

/**
 * A journal's standing, from its ISSN: every index it is in, the SJR quartile, the Web of Science
 * Impact Factor and JIF quartile, and 'ranking' (a short summary for a table column).
 */
export type DerivedKey = 'indexes' | 'sjrQuartile' | 'jif' | 'jifQuartile' | 'ranking' | 'projectPeriod' | 'validUntil';

export interface DerivedColumn {
  key: DerivedKey;
  label: string;
  /** Column header text in each workbook sheet, as for a field. */
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

  /**
   * false: the module's dates are not reporting periods (the Faculty Profile's promotion date), so
   * its records are filed under the cycle's last year. Every other module files a record under the
   * year of its own year or date field, whatever that year is.
   */
  periodic?: boolean;

  /** Fetch this module's facts from an external register (DOI, ISBN). */
  lookup?: LookupConfig;

  fields: FieldConfig[];
  /**
   * Values worked out whenever they are read, never stored on the record: the journal's indexing,
   * quartile and Impact Factor, from its ISSN and the latest lists loaded (server/journals/ranking.ts).
   * They may be named in `listColumns` and exported like fields.
   */
  derived?: DerivedColumn[];
  listColumns: string[];          // field keys (or derived keys) shown in the table
  defaultSort?: { key: string; dir: 'asc' | 'desc' };

  /** Which original workbook sheets this module exports into. */
  exportTargets: Array<{ workbook: WorkbookKey; sheet: string }>;

  /** Profile counter keys this module feeds (see 06-rollups-dashboard.md). */
  feedsCounters?: string[];
}
