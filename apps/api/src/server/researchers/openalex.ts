import { getJson, MAILTO } from '@/server/lookup/http';

/**
 * OpenAlex's author record, found by ORCID iD: free and open (api.openalex.org, no key), so it gives
 * a researcher's works, citations and h-index today, beside Scopus and Web of Science once BIT's
 * keys are in. Its counts are larger than Scopus's or WoS's (it indexes more sources), so it is
 * compared, never mixed in.
 */
export interface OpenAlexAuthor {
  name: string;
  documents: number | null;
  citations: number | null;
  hIndex: number | null;
  openalexId: string;
}

interface Raw {
  id?: string;
  display_name?: string;
  works_count?: number;
  cited_by_count?: number;
  summary_stats?: { h_index?: number };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** null when OpenAlex has no author with this ORCID iD. Throws LookupUnavailable when unreachable. */
export async function openAlexByOrcid(orcid: string): Promise<OpenAlexAuthor | null> {
  const r = (await getJson(`https://api.openalex.org/authors/orcid:${orcid}?mailto=${encodeURIComponent(MAILTO)}`)) as Raw | null;
  if (!r?.id) return null;
  return {
    name: r.display_name ?? '',
    documents: num(r.works_count),
    citations: num(r.cited_by_count),
    hIndex: num(r.summary_stats?.h_index),
    openalexId: r.id.replace('https://openalex.org/', ''),
  };
}
