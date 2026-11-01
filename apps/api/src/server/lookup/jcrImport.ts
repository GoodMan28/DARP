import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { journalIndexListings, journalJcr, journalJcrTitles, journalMetrics } from '@/server/db/schema';
import { journalTitleKey } from '@darp/shared/journals';
import type { JcrPdf, JcrPdfRow } from './jcrPdf';

/*
 * The JCR PDF has names, not ISSNs, and DARP finds a journal by its ISSN. Each journal is matched by its
 * name to the titles DARP already holds: first the Web of Science lists (SCIE, SSCI, AHCI, ESCI), which
 * are the same journals as the JCR; then Scopus and SJR titles, only when the name belongs to at most two
 * ISSNs (a print and an online one), because more means several journals share the name. A journal found
 * by neither is still kept by name, so a paper whose ISSN is wrong or missing can be found by its journal.
 */

export interface JcrImportReport {
  jifYear: number;
  rows: number;
  journals: number;
  /** Journals given their ISSNs by a Web of Science list title. */
  byWos: number;
  /** Journals given their ISSNs by a Scopus or SJR title. */
  byOther: number;
  /** Journals found by name only: they still reach a paper through its journal's name. */
  nameOnly: string[];
  /** Journals whose name belongs to more than two ISSNs in the Scopus and SJR titles, so none was chosen. */
  ambiguous: number;
  /** ISSNs that now carry an Impact Factor. */
  issns: number;
}

const titleMap = (rows: Array<{ issn: string; title: string }>) => {
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = journalTitleKey(r.title);
    if (!k) continue;
    const set = m.get(k);
    if (set) set.add(r.issn); else m.set(k, new Set([r.issn]));
  }
  return m;
};

/** Matches the journals of a read PDF to ISSNs. Reads only; nothing is written. */
export async function matchJcr(pdf: JcrPdf): Promise<{ report: JcrImportReport; issnRows: Array<{ issn: string; row: JcrPdfRow }> }> {
  const wos = titleMap(await db.select({ issn: journalIndexListings.issn, title: journalIndexListings.title }).from(journalIndexListings)
    .where(sql`${journalIndexListings.listName} in ('SCIE','SSCI','AHCI','ESCI') and ${journalIndexListings.title} <> ''`));
  const other = titleMap([
    ...await db.select({ issn: journalIndexListings.issn, title: journalIndexListings.title }).from(journalIndexListings)
      .where(sql`${journalIndexListings.listName} = 'Scopus' and ${journalIndexListings.title} <> ''`),
    ...await db.select({ issn: journalMetrics.issn, title: journalMetrics.title }).from(journalMetrics),
  ]);

  const byIssn = new Map<string, JcrPdfRow>();
  const nameOnly: string[] = [];
  let byWos = 0;
  let byOther = 0;
  let ambiguous = 0;
  for (const j of pdf.journals) {
    const k = journalTitleKey(j.name);
    const w = wos.get(k);
    const o = other.get(k);
    if (w) {
      byWos += 1;
      for (const issn of w) byIssn.set(issn, j);
    } else if (o && o.size <= 2) {
      byOther += 1;
      for (const issn of o) byIssn.set(issn, j);
    } else {
      if (o) ambiguous += 1;
      nameOnly.push(j.name);
    }
  }
  return {
    report: { jifYear: pdf.jifYear, rows: pdf.rows, journals: pdf.journals.length, byWos, byOther, nameOnly, ambiguous, issns: byIssn.size },
    issnRows: [...byIssn].map(([issn, row]) => ({ issn, row })),
  };
}

/**
 * Loads a read PDF for its year, replacing whatever was loaded for that year: a corrected list changes
 * every figure at once, and a journal dropped from it disappears. All or nothing.
 */
export async function storeJcrPdf(pdf: JcrPdf): Promise<JcrImportReport> {
  const { report, issnRows } = await matchJcr(pdf);
  await db.transaction(async (tx) => {
    await tx.delete(journalJcr).where(eq(journalJcr.jifYear, pdf.jifYear));
    await tx.delete(journalJcrTitles).where(eq(journalJcrTitles.jifYear, pdf.jifYear));
    for (let i = 0; i < issnRows.length; i += 500) {
      await tx.insert(journalJcr).values(issnRows.slice(i, i + 500).map(({ issn, row }) => ({
        issn, jifYear: pdf.jifYear, title: row.name.slice(0, 500), jif: row.jif, jifQuartile: row.quartile, categories: '', editions: '',
      })));
    }
    // Two names can give one key (a "The" in front, a name cut short): the first stays.
    const byKey = new Map<string, JcrPdfRow>();
    for (const j of pdf.journals) {
      const k = journalTitleKey(j.name);
      if (k && !byKey.has(k)) byKey.set(k, j);
    }
    const titles = [...byKey];
    for (let i = 0; i < titles.length; i += 500) {
      await tx.insert(journalJcrTitles).values(titles.slice(i, i + 500).map(([titleKey, j]) => ({
        titleKey, jifYear: pdf.jifYear, title: j.name.slice(0, 500), jif: j.jif, jifQuartile: j.quartile,
      })));
    }
  });
  return report;
}
