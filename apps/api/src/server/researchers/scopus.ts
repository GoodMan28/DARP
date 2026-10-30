import { log } from '@/server/log';
import { hIndex } from '@darp/shared/research';

/**
 * Elsevier's Scopus APIs, with BIT's key (dev.elsevier.com). Three calls per researcher:
 *  - Author Retrieval (view METRICS, and LIGHT for the name): documents, citations, h-index;
 *  - Scopus Search, AU-ID(...): the researcher's documents, 25 at a time;
 *  - Citation Overview, citation=exclude-self: each document's citations without self-citations.
 *    Elsevier enables this one per institution; a 401/403 means it is not enabled, which is not an error.
 * Calls are spaced at least 200 ms apart and wait when Elsevier says "too many requests".
 */

const BASE = 'https://api.elsevier.com/content';
const GAP_MS = Number(process.env.ELSEVIER_GAP_MS ?? 200);
const TIMEOUT_MS = 15_000;

export const scopusConnected = () => !!process.env.ELSEVIER_API_KEY;

/** Elsevier refused or could not be reached; the caller keeps what it had. */
export class ScopusUnavailable extends Error {
  override name = 'ScopusUnavailable';
}
/** The key is not entitled to this API or view (Citation Overview not enabled, or an author view off campus). */
export class NotEntitled extends Error {
  override name = 'NotEntitled';
}

let lastCall = 0;

/** GET a JSON document from Elsevier, spaced, with up to three waits on HTTP 429. null on 404. */
async function elsevier(path: string): Promise<unknown | null> {
  const key = process.env.ELSEVIER_API_KEY;
  if (!key) throw new ScopusUnavailable('no Elsevier API key');
  const headers: Record<string, string> = { 'X-ELS-APIKey': key, Accept: 'application/json' };
  if (process.env.ELSEVIER_INSTTOKEN) headers['X-ELS-Insttoken'] = process.env.ELSEVIER_INSTTOKEN;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      // The key travels in a header, never in the URL; the path is safe to log.
      log.warn('elsevier network error', { path: path.split('?')[0], error: String(e) });
      throw new ScopusUnavailable('Elsevier could not be reached');
    }
    if (res.status === 404) return null;
    if (res.ok) return (await res.json()) as unknown;
    if (res.status === 401 || res.status === 403) throw new NotEntitled(`HTTP ${res.status}`);
    if (res.status === 429 && attempt < 3) {
      const seconds = Math.min(Number(res.headers.get('retry-after') ?? '') || 2 ** (attempt + 1), 30);
      log.info('elsevier asked to slow down', { seconds });
      await new Promise((r) => setTimeout(r, seconds * 1000));
      continue;
    }
    log.warn('elsevier refused', { path: path.split('?')[0], status: res.status });
    throw new ScopusUnavailable(`HTTP ${res.status}`);
  }
  throw new ScopusUnavailable('Elsevier kept asking to slow down');
}

/* Elsevier's JSON wraps numbers in strings and single items in objects; read it defensively. */
type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const num = (v: unknown): number | null => {
  const n = Number(typeof v === 'object' && v !== null && '$' in (v as Json) ? (v as Json).$ : v);
  return Number.isFinite(n) ? n : null;
};

/** The first value under `key` anywhere in a document (Elsevier nests differently per view). */
function find(v: unknown, key: string): unknown {
  if (Array.isArray(v)) {
    for (const x of v) { const r = find(x, key); if (r !== undefined) return r; }
    return undefined;
  }
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Json;
  if (key in o) return o[key];
  for (const x of Object.values(o)) { const r = find(x, key); if (r !== undefined) return r; }
  return undefined;
}

export interface ScopusAuthor {
  /** The name on the profile: given and family names, and Scopus's indexed form ("Verma A.K."). */
  given: string;
  family: string;
  indexed: string;
  documents: number | null;
  /** All citations of the author's documents. */
  citations: number | null;
  hIndex: number | null;
}

/** Author Retrieval: the profile's name and its figures. null when Scopus has no such author. */
export async function fetchAuthor(authorId: string): Promise<ScopusAuthor | null> {
  const metrics = await elsevier(`/author/author_id/${authorId}?view=METRICS`);
  if (!metrics) return null;
  const light = await elsevier(`/author/author_id/${authorId}?view=LIGHT`);
  const name = obj(find(light, 'preferred-name'));
  return {
    given: String(name['given-name'] ?? ''),
    family: String(name.surname ?? ''),
    indexed: String(name['indexed-name'] ?? ''),
    documents: num(find(metrics, 'document-count')),
    citations: num(find(metrics, 'citation-count')) ?? num(find(metrics, 'cited-by-count')),
    hIndex: num(find(metrics, 'h-index')),
  };
}

/** Scopus Search: every document of the author, as Scopus ids with their citation counts. */
export async function fetchDocuments(authorId: string, max = 2000): Promise<Array<{ id: string; citedBy: number }>> {
  const out: Array<{ id: string; citedBy: number }> = [];
  for (let start = 0; start < max; start += 25) {
    const page = await elsevier(`/search/scopus?query=AU-ID(${authorId})&field=eid,dc:identifier,citedby-count&count=25&start=${start}`);
    const results = obj(obj(page)['search-results']);
    const entries = list(results.entry).map(obj).filter((e) => !e.error);
    for (const e of entries) {
      const id = String(e['dc:identifier'] ?? '').replace(/^SCOPUS_ID:/, '');
      if (id) out.push({ id, citedBy: num(e['citedby-count']) ?? 0 });
    }
    const total = num(results['opensearch:totalResults']) ?? 0;
    if (entries.length < 25 || start + 25 >= total) break;
  }
  return out;
}

/**
 * Citation Overview without self-citations: each document's total, 25 documents a call. null when
 * Elsevier has not enabled the API for BIT (then figures without self-citations are not known).
 */
export async function fetchCitationsExclSelf(ids: string[]): Promise<number[] | null> {
  const totals: number[] = [];
  try {
    for (let i = 0; i < ids.length; i += 25) {
      const batch = ids.slice(i, i + 25);
      const res = await elsevier(`/abstract/citations?scopus_id=${batch.join(',')}&citation=exclude-self`);
      // Per document: citations before the range (pcc), in it (rowTotal) and after it (lcc).
      for (const info of list(find(res, 'citeInfo')).map(obj)) {
        totals.push((num(info.pcc) ?? 0) + (num(info.rowTotal) ?? 0) + (num(info.lcc) ?? 0));
      }
    }
  } catch (e) {
    if (e instanceof NotEntitled || (e instanceof Error && e.name === 'NotEntitled')) return null;
    throw e;
  }
  return totals;
}

export interface ScopusFigures {
  /** The profile's name; null when Elsevier refuses the author views (a key used off campus without an institutional token). */
  author: ScopusAuthor | null;
  documents: number | null;
  citations: number | null;
  hIndex: number | null;
  citationsExclSelf: number | null;
  hIndexExclSelf: number | null;
}

/** Everything for one author: the profile's figures, and the same without self-citations when enabled. */
export async function scopusFigures(authorId: string): Promise<ScopusFigures | null> {
  // Author Retrieval needs institutional access. Without it (HTTP 401) the figures come from the paper
  // search instead: every paper with its citation count, from which documents, citations and the
  // h-index follow. The profile's name is then unknown, so the caller decides whom to trust.
  let author: ScopusAuthor | null = null;
  try {
    author = await fetchAuthor(authorId);
    if (!author) return null;
  } catch (e) {
    if (!(e instanceof NotEntitled)) throw e;
  }
  const docs = await fetchDocuments(authorId);
  if (!author && docs.length === 0) return null;
  const excl = docs.length ? await fetchCitationsExclSelf(docs.map((d) => d.id)) : [];
  return {
    author,
    documents: author?.documents ?? docs.length,
    citations: author?.citations ?? docs.reduce((n, d) => n + d.citedBy, 0),
    hIndex: author?.hIndex ?? hIndex(docs.map((d) => d.citedBy)),
    citationsExclSelf: excl ? excl.reduce((n, c) => n + c, 0) : null,
    hIndexExclSelf: excl ? hIndex(excl) : null,
  };
}

export interface SerialMetrics {
  title: string;
  /** The newest SJR (SCImago Journal Rank) Elsevier lists, and its year. */
  sjr: number | null;
  sjrYear: number | null;
  snip: number | null;
  /** CiteScore of the current year. */
  citeScore: number | null;
}

/** A journal's SJR, SNIP and CiteScore from Elsevier's open Serial Title view. null when Scopus has no such journal. */
export async function serialMetrics(issn: string): Promise<SerialMetrics | null> {
  const r = await elsevier(`/serial/title/issn/${issn.replace(/-/g, '')}`);
  const e = obj(list(obj(obj(r)['serial-metadata-response']).entry)[0]);
  if (!e['dc:title']) return null;
  const newest = (v: unknown): { n: number | null; year: number | null } => {
    const rows = list(v).map(obj).map((x) => ({ n: num(x.$), year: num(x['@year']) })).filter((x) => x.n !== null);
    const last = rows.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
    return { n: last?.n ?? null, year: last?.year ?? null };
  };
  const sjr = newest(obj(e.SJRList).SJR);
  return {
    title: String(e['dc:title']), sjr: sjr.n, sjrYear: sjr.year, snip: newest(obj(e.SNIPList).SNIP).n,
    citeScore: num(obj(e.citeScoreYearInfoList).citeScoreCurrentMetric),
  };
}
