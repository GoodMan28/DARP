// A researcher's figures (Scopus, Web of Science) and the research-quality signal worked out from
// them. Pure, shared by the server (which computes) and the web (which shows the same wording).

/** The largest h such that h of the counts are at least h. hIndex([10, 8, 5, 4, 3]) = 4. */
export function hIndex(counts: number[]): number {
  const sorted = counts.filter((c) => Number.isFinite(c) && c > 0).sort((a, b) => b - a);
  let h = 0;
  while (h < sorted.length && sorted[h]! >= h + 1) h += 1;
  return h;
}

/** A Scopus Author ID: 10 or 11 digits. */
export const SCOPUS_ID = /^\d{10,11}$/;
/** A typed Scopus ID is the person's when at least this share of its papers carry their surname and first initial. */
export const NAME_SHARE_MIN = 0.5;
/** BIT Mesra in Scopus (found through the paper search, Oct 2026; the library should confirm it). */
export const BIT_SCOPUS_AFFILIATION_ID = '60026714';
/** A Web of Science ResearcherID, e.g. AAB-1234-2020. */
export const RESEARCHER_ID = /^[A-Z]{1,3}-\d{4}-\d{4}$/;

export interface MetricsRow {
  /** 'openalex': OpenAlex's author record, found by ORCID iD (free; counts more sources than Scopus or WoS). */
  /** 'scopus-typed': figures the person typed from their Scopus page, with a screenshot. */
  source: 'scopus' | 'scopus-typed' | 'wos' | 'openalex';
  asOf: string;
  documents: number | null;
  citations: number | null;
  citationsExclSelf: number | null;
  hIndex: number | null;
  hIndexExclSelf: number | null;
  /** The ID's owner was confirmed (ORCID lists it, or the name matched). false: fetched from a typed ID whose name could not be matched. */
  verified?: boolean;
}

/** IQAC's thresholds for the label (Administration can change them). */
export interface QualityThresholds {
  /** Quality-leaning: WoS share and Q1+Q2 share both at least these (percent). */
  qualityWosShare: number;
  qualityTopShare: number;
  /** Volume-leaning: at least this many Scopus documents, with Q1+Q2 share and citations per paper below these. */
  volumeDocuments: number;
  volumeTopShare: number;
  volumeCitationsPerPaper: number;
  /** Fewer documents than this: not enough data for a label. */
  minDocuments: number;
}

export const DEFAULT_THRESHOLDS: QualityThresholds = {
  qualityWosShare: 50, qualityTopShare: 50,
  volumeDocuments: 10, volumeTopShare: 25, volumeCitationsPerPaper: 2,
  minDocuments: 3,
};

export type QualityLabel = 'quality' | 'volume' | 'balanced' | 'unknown';

export const QUALITY_LABEL: Record<QualityLabel, string> = {
  quality: 'Quality-leaning',
  volume: 'Volume-leaning',
  balanced: 'Balanced',
  unknown: 'Not enough data',
};

export interface QualitySignal {
  scopusDocuments: number | null;
  wosDocuments: number | null;
  /** WoS documents ÷ Scopus documents, percent, at most 100. */
  wosShare: number | null;
  /**
   * Scopus citations ÷ Scopus documents: without self-citations when Elsevier's Citation Overview is
   * enabled for BIT, otherwise with them (`citationsInclSelf` says which).
   */
  citationsPerPaper: number | null;
  citationsInclSelf: boolean;
  /** Scopus h-index, without self-citations when known; and whether it is. */
  scopusHIndex: number | null;
  scopusHIndexExclSelf: boolean;
  wosHIndex: number | null;
  /** Approved DARP papers in the chosen years, and how many are in a Q1 or Q2 journal. */
  papers: number;
  topPapers: number;
  /** Q1+Q2 papers ÷ papers, percent; null with no papers. */
  topShare: number | null;
  label: QualityLabel;
}

const pct = (a: number, b: number) => Math.round((100 * a) / b);

/**
 * The signal from the latest Scopus and WoS rows and the person's DARP papers. Every number is shown
 * with the label, which is only a summary: "Citation habits differ by subject; compare within a
 * department."
 */
export function qualitySignal(
  scopus: MetricsRow | null, wos: MetricsRow | null, papers: number, topPapers: number,
  t: QualityThresholds = DEFAULT_THRESHOLDS,
  /** OpenAlex's count of works: only to tell whether there is enough to judge, never in a share. */
  openalex: MetricsRow | null = null,
): QualitySignal {
  const sDocs = scopus?.documents ?? null;
  const wDocs = wos?.documents ?? null;
  const wosShare = sDocs && wDocs !== null ? Math.min(100, pct(wDocs, sDocs)) : null;
  const exclSelf = scopus?.citationsExclSelf ?? null;
  const cites = exclSelf ?? scopus?.citations ?? null;
  const citationsPerPaper = sDocs && cites !== null ? Math.round((cites / sDocs) * 10) / 10 : null;
  const topShare = papers > 0 ? pct(topPapers, papers) : null;
  const documents = Math.max(sDocs ?? 0, wDocs ?? 0, papers, openalex?.documents ?? 0);

  let label: QualityLabel = 'balanced';
  if (documents < t.minDocuments) label = 'unknown';
  else if (wosShare !== null && topShare !== null && wosShare >= t.qualityWosShare && topShare >= t.qualityTopShare) label = 'quality';
  else if ((sDocs ?? 0) >= t.volumeDocuments && topShare !== null && topShare < t.volumeTopShare
    && citationsPerPaper !== null && citationsPerPaper < t.volumeCitationsPerPaper) label = 'volume';

  return {
    scopusDocuments: sDocs,
    wosDocuments: wDocs,
    wosShare,
    citationsPerPaper,
    citationsInclSelf: exclSelf === null && cites !== null,
    scopusHIndex: scopus ? (scopus.hIndexExclSelf ?? scopus.hIndex) : null,
    scopusHIndexExclSelf: scopus?.hIndexExclSelf !== null && scopus?.hIndexExclSelf !== undefined,
    wosHIndex: wos?.hIndex ?? null,
    papers, topPapers, topShare, label,
  };
}

/** What Elsevier said about a Scopus Author ID when it was saved or last refreshed. */
export interface ScopusCheck {
  checkedAt: string;
  /** The name on the Scopus profile, as Scopus indexes it. */
  scopusName: string;
  nameMatches: boolean;
  /** Author views refused: the share of the ID's papers that carry the person's surname and first initial. */
  nameShare?: number;
  /** Not checked: no Elsevier key yet, or Elsevier could not be reached. */
  unchecked?: 'no-key' | 'unreachable';
  /** Citation Overview (needed for figures without self-citations) is not enabled for BIT. */
  noCitationOverview?: boolean;
  /** What Web of Science's Researcher API said about the ResearcherID, when Clarivate's key is set. */
  wos?: { checkedAt: string; wosName: string; nameMatches: boolean; unchecked?: 'unreachable' | 'not-found' };
}

/** GET /api/profile/research: a person's research IDs, latest figures and signal. */
export interface ResearchProfile {
  userId: string;
  name: string;
  /** The ORCID iD, and whether DARP trusts it (found on orcid.org under the account's name). */
  orcid: string | null;
  orcidTrusted: boolean;
  /** The IDs below were read from the ORCID record ("Other IDs"), not typed. */
  idsFromOrcid: { scopusAuthorId: boolean; researcherId: boolean };
  scopusAuthorId: string | null;
  scopusCheck: ScopusCheck | null;
  researcherId: string | null;
  scopus: MetricsRow | null;
  /** Figures the person typed from their Scopus page, with the screenshot. */
  scopusTyped: (MetricsRow & { evidenceId: string | null }) | null;
  /** Of the Scopus documents, how many were written at BIT (by affiliation ID); null when not known. */
  scopusBitDocuments: number | null;
  wos: (MetricsRow & { evidenceId: string | null; typed: boolean }) | null;
  openalex: MetricsRow | null;
  signal: QualitySignal;
  range: { from: number; to: number };
  /** Elsevier is connected (an API key is set). */
  scopusConnected: boolean;
  /** Clarivate is connected: WoS figures are fetched, not typed. */
  wosConnected: boolean;
  thresholds: QualityThresholds;
}

/** One row of IQAC's "Research quality" table. */
export interface ResearchQualityRow {
  userId: string;
  name: string;
  department: string;
  scopusAuthorId: string | null;
  researcherId: string | null;
  scopusAsOf: string | null;
  wosAsOf: string | null;
  orcid: string | null;
  /** The three sources side by side. */
  scopus: MetricsRow | null;
  wos: MetricsRow | null;
  openalex: MetricsRow | null;
  /** Part of the Scopus figures were typed by the person; the screenshots are for IQAC. */
  scopusTyped: boolean;
  scopusEvidenceId: string | null;
  wosEvidenceId: string | null;
  signal: QualitySignal;
}

/** One set of Scopus figures: the fetched ones, with any gap filled from what the person typed. */
export function effectiveScopus(fetched: MetricsRow | null, typed: MetricsRow | null): MetricsRow | null {
  if (!fetched) return typed;
  if (!typed) return fetched;
  return {
    ...fetched,
    documents: fetched.documents ?? typed.documents,
    citations: fetched.citations ?? typed.citations,
    citationsExclSelf: fetched.citationsExclSelf ?? typed.citationsExclSelf,
    hIndex: fetched.hIndex ?? typed.hIndex,
    hIndexExclSelf: fetched.hIndexExclSelf ?? typed.hIndexExclSelf,
  };
}
