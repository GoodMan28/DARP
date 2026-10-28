/*
 * Journal lists (SCImago SJR, Web of Science collections) — reading the downloaded CSV files.
 * Pure functions, shared by the admin upload screen (which parses the file in the browser, so a
 * 10 MB file never crosses the proxy) and the command-line import.
 */

/** One journal ISSN from a list. A journal with print and electronic ISSNs gives two rows. */
export interface JournalListRow {
  issn: string;                 // 8 characters, no hyphen, upper-case X
  title: string;
  /** SJR only: journal | book series | conference and proceedings | trade journal */
  sourceType?: string;
  /** SJR only: Q1..Q4, or null when the journal is unranked that year */
  quartile?: string | null;
  /** SJR only: the years Scopus covered the journal, as SCImago writes them ("1996-2001, 2003-2026"). */
  coverage?: string;
}

export interface CoverageRange { from: number; to: number | null }

/**
 * "2019-2023; 2016-2017", "2014-ongoing, 2012", "2002; 2000" → year ranges, oldest first.
 * "ongoing" gives to: null; a single year is a range of one year. Anything unreadable is skipped.
 */
export function parseCoverage(text: string): CoverageRange[] {
  const out: CoverageRange[] = [];
  for (const part of text.split(/[;,]/)) {
    const m = part.trim().match(/^((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}|ongoing|present))?$/i);
    if (!m) continue;
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : /^\d/.test(m[2]) ? Number(m[2]) : null;
    if (to !== null && to < from) continue;
    if (!out.some((r) => r.from === from)) out.push({ from, to });
  }
  return out.sort((a, b) => a.from - b.from);
}

/**
 * Minimal CSV reader (SCImago uses semicolons, Clarivate commas). Handles quoted cells,
 * doubled quotes, CRLF line endings and a leading byte-order mark.
 */
export function parseCsv(text: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;   // byte-order mark
  const head = body.split('\n', 1)[0] ?? '';
  const delim = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** '0167-739x' / '0167739X' → '0167739X'; anything else → null. */
export function normIssn(s: string): string | null {
  const v = s.replace(/[^0-9xX]/g, '').toUpperCase();
  return /^\d{7}[\dX]$/.test(v) ? v : null;
}

export type ExtractResult =
  | { ok: true; rows: JournalListRow[]; journals: number }
  | { ok: false; message: string };

/** The SCImago "Download data" file: Rank;Sourceid;Title;Type;Issn;SJR;SJR Best Quartile;… */
export function extractSjrRows(table: string[][]): ExtractResult {
  const [header, ...data] = table;
  if (!header) return { ok: false, message: 'The file is empty.' };
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const iIssn = col('Issn');
  const iQ = col('SJR Best Quartile');
  const iTitle = col('Title');
  const iType = col('Type');
  const iCoverage = col('Coverage');
  if ([iIssn, iQ, iTitle, iType].some((i) => i < 0)) {
    return {
      ok: false,
      message: `This is not a SCImago file: it needs the columns Title, Type, Issn and SJR Best Quartile. Found: ${header.slice(0, 8).join(', ')}…`,
    };
  }
  const rows = data.flatMap((r) => {
    const q = (r[iQ] ?? '').trim();
    return (r[iIssn] ?? '').split(',')
      .map((s) => normIssn(s))
      .filter((x): x is string => x !== null)
      .map((issn) => ({
        issn,
        title: (r[iTitle] ?? '').trim().slice(0, 500),
        sourceType: (r[iType] ?? '').trim().toLowerCase().slice(0, 60),
        quartile: /^Q[1-4]$/.test(q) ? q : null,
        ...(iCoverage >= 0 && r[iCoverage] ? { coverage: r[iCoverage]!.trim().slice(0, 200) } : {}),
      }));
  });
  if (rows.length === 0) return { ok: false, message: 'No journal in this file has a valid ISSN.' };
  return { ok: true, rows, journals: data.length };
}

/** One ISSN of a journal in a Journal Citation Reports export. */
export interface JcrRow {
  issn: string;                 // 8 characters, no hyphen, upper-case X
  title: string;
  /** As JCR prints it: "5.2", "<0.1"; null when JCR says N/A. */
  jif: string | null;
  /** Q1..Q4, the best across the journal's categories; null when JCR gives none. */
  jifQuartile: string | null;
  categories: string;
  editions: string;
}

export type JcrExtractResult =
  | { ok: true; jifYear: number; rows: JcrRow[]; journals: number }
  | { ok: false; message: string };

const QUARTILE_RANK: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
const better = (a: string | null, b: string | null) => (
  a === null ? b : b === null ? a : (QUARTILE_RANK[a]! <= QUARTILE_RANK[b]! ? a : b)
);
const joinDistinct = (a: string, b: string) => (
  [...new Set([...a.split('; '), ...b.split('; ')].filter(Boolean))].join('; ')
);

/**
 * A Journal Citation Reports export (Clarivate, "Export → CSV"). Title lines come before the header
 * row ("Journal name, …, ISSN, eISSN, Category, Edition, …, 2024 JIF, JIF Quartile, …") and a
 * copyright line after the data. A journal listed once per category is merged into one row per
 * ISSN with its best quartile, so several exports (one per category) can be loaded one after another.
 */
export function extractJcrRows(table: string[][]): JcrExtractResult {
  const cell = (r: string[] | undefined, i: number) => (i >= 0 ? (r?.[i] ?? '').trim() : '');
  const at = table.findIndex((r) => r.some((c) => c.trim().toLowerCase() === 'issn') && r.some((c) => /\bJIF\b/i.test(c)));
  if (at < 0) {
    const first = table.find((r) => r.some((c) => c.trim() !== '')) ?? [];
    return {
      ok: false,
      message: `This is not a Journal Citation Reports export: it needs the columns ISSN and "<year> JIF". Found: ${first.slice(0, 8).join(', ')}…`,
    };
  }
  const header = table[at]!.map((h) => h.trim());
  const col = (test: (h: string) => boolean) => header.findIndex(test);
  // "2024 JIF", not "5 Year JIF" or "JIF Without Self Cites".
  const iJif = col((h) => /^(19|20)\d{2}\s+JIF$/i.test(h));
  const iQ = col((h) => /^JIF Quartile$/i.test(h));
  const iIssn = col((h) => h.toLowerCase() === 'issn');
  const iEissn = col((h) => h.toLowerCase() === 'eissn');
  const iTitle = col((h) => /^(journal name|journal title|full journal title|title)$/i.test(h));
  const iCat = col((h) => /^categor(y|ies)$/i.test(h));
  const iEd = col((h) => /^editions?$/i.test(h));
  if (iJif < 0) return { ok: false, message: 'The Impact Factor column ("2024 JIF", for example) was not found in this file.' };
  const jifYear = Number(header[iJif]!.slice(0, 4));

  const byIssn = new Map<string, JcrRow>();
  let journals = 0;
  for (const r of table.slice(at + 1)) {
    const issns = [...new Set([normIssn(cell(r, iIssn)), normIssn(cell(r, iEissn))].filter((x): x is string => x !== null))];
    if (issns.length === 0) continue;        // a title, blank or copyright line
    journals += 1;
    const rawJif = cell(r, iJif);
    const q = cell(r, iQ).toUpperCase();
    const row: Omit<JcrRow, 'issn'> = {
      title: cell(r, iTitle).slice(0, 500),
      jif: /^<?\d{1,4}(\.\d{1,3})?$/.test(rawJif) ? rawJif : null,
      jifQuartile: /^Q[1-4]$/.test(q) ? q : null,
      categories: cell(r, iCat).slice(0, 500),
      editions: cell(r, iEd).slice(0, 60),
    };
    for (const issn of issns) {
      const seen = byIssn.get(issn);
      byIssn.set(issn, seen
        ? {
          ...seen,
          jif: seen.jif ?? row.jif,
          jifQuartile: better(seen.jifQuartile, row.jifQuartile),
          categories: joinDistinct(seen.categories, row.categories).slice(0, 500),
          editions: joinDistinct(seen.editions, row.editions).slice(0, 60),
        }
        : { issn, ...row });
    }
  }
  if (byIssn.size === 0) return { ok: false, message: 'No journal in this file has a valid ISSN.' };
  return { ok: true, jifYear, rows: [...byIssn.values()], journals };
}

/* ───────────── a journal's standing, as shown to people ───────────── */

/** Worked out from the journal's ISSN and the latest lists loaded; null = not found ("NA"). */
export interface JournalRanking {
  /** Every index the journal is in, in IQAC's Indexing order; [] = none. */
  indexes: string[];
  sjrQuartile: string | null;
  sjrYear: number | null;
  /** Computed from Elsevier's Scopus list rather than taken from SCImago's own file. */
  sjrEstimated: boolean;
  jif: string | null;
  jifQuartile: string | null;
  jifYear: number | null;
}

export const NOT_AVAILABLE = 'NA';

/** Each derived column's text: "Scopus, SCIE", "Q1 (SJR 2024)", "5.2 (JIF 2024)", "NA". */
export function rankingTexts(r: JournalRanking): Record<'indexes' | 'sjrQuartile' | 'jif' | 'jifQuartile' | 'ranking', string> {
  const sjr = r.sjrQuartile ? `${r.sjrQuartile} (SJR ${r.sjrYear}${r.sjrEstimated ? ', estimated' : ''})` : NOT_AVAILABLE;
  const jif = r.jif ? `${r.jif} (JIF ${r.jifYear})` : NOT_AVAILABLE;
  const jifQ = r.jifQuartile ? `${r.jifQuartile} (JIF ${r.jifYear})` : NOT_AVAILABLE;
  // A table cell: "Q1 SJR · IF 5.2".
  const summary = [r.sjrQuartile ? `${r.sjrQuartile} SJR` : null, r.jif ? `IF ${r.jif}` : null].filter(Boolean).join(' · ');
  return {
    indexes: r.indexes.length > 0 ? r.indexes.join(', ') : NOT_AVAILABLE,
    sjrQuartile: sjr,
    jif,
    jifQuartile: jifQ,
    ranking: summary || NOT_AVAILABLE,
  };
}

/** A Web of Science (Master Journal List) or Scopus source list: any column whose name has "ISSN". */
export function extractListRows(table: string[][]): ExtractResult {
  const [header, ...data] = table;
  if (!header) return { ok: false, message: 'The file is empty.' };
  const issnCols = header.map((h, i) => (/issn/i.test(h) ? i : -1)).filter((i) => i >= 0);
  const iTitle = header.findIndex((h) => /title/i.test(h));
  if (issnCols.length === 0) {
    return { ok: false, message: `No ISSN column in this file. Found: ${header.slice(0, 8).join(', ')}…` };
  }
  const rows = data.flatMap((r) => [...new Set(
    issnCols.map((i) => normIssn(r[i] ?? '')).filter((x): x is string => x !== null),
  )].map((issn) => ({ issn, title: iTitle >= 0 ? (r[iTitle] ?? '').trim().slice(0, 500) : '' })));
  if (rows.length === 0) return { ok: false, message: 'No journal in this file has a valid ISSN.' };
  return { ok: true, rows, journals: data.length };
}
