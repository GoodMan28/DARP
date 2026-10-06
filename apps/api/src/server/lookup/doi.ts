import type { LookupResult } from './types';
import { notFound } from './types';
import { getJson, MAILTO } from './http';
import { clean, encodePath } from './text';
import { fromCrossref, type CrossrefWork } from './crossref';
import { namesMatch, BIT_ROR } from './names';
import { journalFacts } from './journals';

/** 'https://doi.org/10.1/X', 'doi:10.1/x', '10.1/X' → '10.1/x'; anything else → null. */
export function normaliseDoiInput(raw: string): string | null {
  const v = raw.trim()
    .replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(v) ? v : null;
}

interface DataciteAttributes {
  titles?: Array<{ title?: string }>;
  creators?: Array<{ name?: string; givenName?: string; familyName?: string }>;
  publisher?: string | { name?: string };
  publicationYear?: number | string;
  types?: { resourceTypeGeneral?: string };
  container?: { title?: string; identifier?: string; identifierType?: string };
}

function fromDatacite(doi: string, a: DataciteAttributes): LookupResult {
  const people = (a.creators ?? []).map((c) => ({
    given: clean(c.givenName), family: clean(c.familyName), full: clean(c.name),
    orcid: null, bitAffiliated: null,
  }));
  const general = a.types?.resourceTypeGeneral ?? '';
  return {
    found: true,
    source: 'datacite',
    authoritative: true,
    rawType: general === 'JournalArticle' ? 'journal-article' : general.toLowerCase(),
    values: {
      doi,
      title: clean(a.titles?.[0]?.title),
      authors: people.map((p) => p.full || `${p.given} ${p.family}`.trim()).join(', '),
      containerTitle: clean(a.container?.title),
      year: a.publicationYear ? String(a.publicationYear) : '',
      publisher: clean(typeof a.publisher === 'string' ? a.publisher : a.publisher?.name),
      workType: general,
    },
    people,
    identifiers: {
      issn: a.container?.identifierType === 'ISSN' && a.container.identifier ? [a.container.identifier] : [],
      isbn: [],
    },
    flags: [],
    fetchedAt: new Date().toISOString(),
  };
}

interface OpenAlexWork {
  is_retracted?: boolean;
  authorships?: Array<{
    raw_author_name?: string;
    author?: { display_name?: string };
    institutions?: Array<{ ror?: string | null }>;
  }>;
  primary_location?: { source?: { issn_l?: string | null; issn?: string[] | null } | null } | null;
}

/** Adds BIT affiliation, retraction and extra ISSNs from OpenAlex. Optional: never throws. */
export async function enrichFromOpenAlex(doi: string, r: LookupResult): Promise<void> {
  try {
    const key = process.env.OPENALEX_API_KEY;
    const w = (await getJson(
      `https://api.openalex.org/works/doi:${encodePath(doi)}?select=is_retracted,authorships,primary_location${key ? `&api_key=${encodeURIComponent(key)}` : ''}`,
    )) as OpenAlexWork | null;
    if (!w) return;
    if (w.is_retracted && !r.flags.includes('retracted')) r.flags.push('retracted');
    for (const a of w.authorships ?? []) {
      const name = a.raw_author_name ?? a.author?.display_name ?? '';
      const target = r.people.find((p) => namesMatch(name, p));
      if (!target) continue;
      const insts = a.institutions ?? [];
      const bit = insts.some((i) => (i.ror ?? '').endsWith(BIT_ROR));
      if (bit) target.bitAffiliated = true;
      else if (target.bitAffiliated === null && insts.length > 0) target.bitAffiliated = false;
    }
    const src = w.primary_location?.source;
    if (src?.issn_l) r.identifiers.issn.push(src.issn_l);
    if (src?.issn) r.identifiers.issn.push(...src.issn);
  } catch {
    // OpenAlex adds confidence; without it the Crossref facts still stand.
  }
}

export async function resolveDoi(doi: string): Promise<LookupResult> {
  const cr = (await getJson(
    `https://api.crossref.org/works/${encodePath(doi)}?mailto=${encodeURIComponent(MAILTO)}`,
  )) as { message?: CrossrefWork } | null;

  let r: LookupResult;
  if (cr?.message) {
    r = fromCrossref(cr.message);
  } else {
    const dc = (await getJson(`https://api.datacite.org/dois/${encodePath(doi)}`)) as
      { data?: { attributes?: DataciteAttributes } } | null;
    if (!dc?.data?.attributes) return notFound();
    r = fromDatacite(doi, dc.data.attributes);
  }

  await enrichFromOpenAlex(doi, r);

  if (r.rawType === 'journal-article') {
    const facts = await journalFacts(r.identifiers.issn, r.values.year ? Number(r.values.year) : null);
    r.values.quartile = facts.quartile;
    r.values.indexing = facts.indexing;
    r.flags.push(...facts.flags);
  } else {
    r.values.quartile = 'Not applicable (not a journal)';
  }
  return r;
}
