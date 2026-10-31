import { log } from '@/server/log';

/**
 * Clarivate's Web of Science Researcher API (developer.clarivate.com/apis/wos-researcher), with BIT's
 * key: GET /researchers/{ResearcherID} gives the profile's name, its ORCID iDs and `metricsAllTime`
 * (h-index, documents, times cited with and without self-citations). Checked against Clarivate's
 * published OpenAPI definition on 30 October 2026. Limits: 5 requests a second, 5,000 a day.
 * Without a key, the figures are typed by the person with a screenshot.
 */

const BASE = 'https://api.clarivate.com/apis/wos-researcher';
const GAP_MS = Number(process.env.CLARIVATE_GAP_MS ?? 250);

export const wosConnected = () => !!process.env.CLARIVATE_API_KEY;

export class WosUnavailable extends Error {
  override name = 'WosUnavailable';
}

export interface WosResearcher {
  fullName: string;
  firstName: string;
  lastName: string;
  orcids: string[];
  documents: number | null;
  citations: number | null;
  citationsExclSelf: number | null;
  hIndex: number | null;
}

interface Raw {
  ids?: { rids?: string[]; orcids?: string[] };
  name?: { fullName?: string; firstName?: string; lastName?: string };
  metricsAllTime?: {
    hIndex?: number;
    documents?: { count?: number };
    totalTimesCited?: number;
    totalTimesCitedWithoutSelf?: number;
  };
}

let lastCall = 0;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The researcher's record, or null when Web of Science has no such ResearcherID. */
export async function wosResearcher(rid: string): Promise<WosResearcher | null> {
  const key = process.env.CLARIVATE_API_KEY;
  if (!key) throw new WosUnavailable('no Clarivate API key');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    let res: Response;
    try {
      res = await fetch(`${BASE}/researchers/${encodeURIComponent(rid)}`, {
        headers: { 'X-ApiKey': key, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      log.warn('clarivate network error', { error: String(e) });
      throw new WosUnavailable('Web of Science could not be reached');
    }
    if (res.status === 404) return null;
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, Math.min(Number(res.headers.get('retry-after') ?? '') || 2 ** (attempt + 1), 30) * 1000));
      continue;
    }
    if (!res.ok) {
      log.warn('clarivate refused', { status: res.status });
      throw new WosUnavailable(`HTTP ${res.status}`);
    }
    const r = (await res.json()) as Raw;
    const m = r.metricsAllTime ?? {};
    return {
      fullName: r.name?.fullName ?? '', firstName: r.name?.firstName ?? '', lastName: r.name?.lastName ?? '',
      orcids: (r.ids?.orcids ?? []).map((o) => o.replace(/^https?:\/\/orcid\.org\//, '')),
      documents: num(m.documents?.count), citations: num(m.totalTimesCited),
      citationsExclSelf: num(m.totalTimesCitedWithoutSelf), hIndex: num(m.hIndex),
    };
  }
  throw new WosUnavailable('Web of Science kept asking to slow down');
}
