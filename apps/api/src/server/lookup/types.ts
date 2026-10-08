import type { MetaKey } from '@darp/shared/modules/types';
import type { LookupSource } from '@darp/shared/contracts';

export interface Person {
  given: string;
  family: string;
  full: string;
  orcid: string | null;
  /** true = listed with BIT Mesra, false = listed only with other institutions, null = unknown. */
  bitAffiliated: boolean | null;
}

export interface LookupResult {
  found: boolean;
  source: LookupSource | null;
  /** Crossref / DataCite = true. Suggestions (Open Library) = false: never locked, never auto-approved. */
  authoritative: boolean;
  /** Crossref `type`, e.g. journal-article, book-chapter. */
  rawType: string | null;
  values: Partial<Record<MetaKey, string>>;
  people: Person[];
  identifiers: { issn: string[]; isbn: string[] };
  /** Machine flags turned into reasons by apply.ts: retracted, proceedings, not-indexed, … */
  flags: string[];
  fetchedAt: string;
}

export function notFound(): LookupResult {
  return {
    found: false, source: null, authoritative: false, rawType: null, values: {}, people: [],
    identifiers: { issn: [], isbn: [] }, flags: [], fetchedAt: new Date().toISOString(),
  };
}
