import type { LookupResult, Person } from './types';
import { clean } from './text';
import { isBitAffiliation } from './names';
import { normIssn, formatIssn } from './journals';
import { isbn13 } from './isbn';

interface CrossrefDate { 'date-parts'?: Array<Array<number | null>> }
interface CrossrefPerson {
  given?: string; family?: string; name?: string; ORCID?: string;
  affiliation?: Array<{ name?: string; id?: Array<{ id?: string; 'id-type'?: string }> }>;
}
export interface CrossrefWork {
  DOI: string;
  type?: string;
  title?: string[];
  'container-title'?: string[];
  author?: CrossrefPerson[];
  editor?: CrossrefPerson[];
  ISSN?: string[];
  'issn-type'?: Array<{ value: string; type: string }>;
  ISBN?: string[];
  'isbn-type'?: Array<{ value: string; type: string }>;
  'published-print'?: CrossrefDate;
  'published-online'?: CrossrefDate;
  issued?: CrossrefDate;
  'journal-issue'?: { 'published-print'?: CrossrefDate };
  volume?: string;
  issue?: string;
  page?: string;
  'article-number'?: string;
  publisher?: string;
  event?: { name?: string };
  'update-to'?: Array<{ type?: string }>;
  'updated-by'?: Array<{ type?: string }>;
}

const yearOf = (d?: CrossrefDate): number | null => {
  const y = d?.['date-parts']?.[0]?.[0];
  return typeof y === 'number' ? y : null;
};

const RETRACTION = new Set(['retraction', 'withdrawal', 'removal']);

export const WORK_TYPE_LABEL: Record<string, string> = {
  'journal-article': 'Journal article',
  'proceedings-article': 'Conference paper',
  'book-chapter': 'Book chapter',
  book: 'Book',
  'edited-book': 'Edited book',
  monograph: 'Monograph',
  'reference-entry': 'Reference entry',
  'posted-content': 'Preprint',
};

export function toPerson(a: CrossrefPerson): Person {
  const given = clean(a.given);
  const family = clean(a.family);
  const affs = a.affiliation ?? [];
  return {
    given,
    family,
    full: a.name ? clean(a.name) : `${given} ${family}`.trim(),
    orcid: a.ORCID ? a.ORCID.replace(/^https?:\/\/orcid\.org\//, '') : null,
    bitAffiliated: affs.length === 0
      ? null
      : affs.some((x) => isBitAffiliation(x.name ?? '', (x.id ?? []).map((i) => i.id ?? ''))),
  };
}

export function isbnsOf(w: CrossrefWork): string[] {
  const raw = [...(w['isbn-type'] ?? []).map((i) => i.value), ...(w.ISBN ?? [])];
  return [...new Set(raw.map(isbn13).filter((x): x is string => x !== null))];
}

/** Crossref work → LookupResult. The reporting year is the print year when there is one. */
export function fromCrossref(w: CrossrefWork): LookupResult {
  const people = (w.author ?? []).map(toPerson);
  const year = yearOf(w['published-print']) ?? yearOf(w['journal-issue']?.['published-print']) ?? yearOf(w.issued);
  const issnAll = [...(w['issn-type'] ?? []).map((i) => i.value), ...(w.ISSN ?? [])];
  const printIssn = (w['issn-type'] ?? []).find((i) => i.type === 'print')?.value;
  const issnMain = normIssn(printIssn ?? issnAll[0] ?? '');

  const flags: string[] = [];
  const updates = [...(w['update-to'] ?? []), ...(w['updated-by'] ?? [])];
  if (updates.some((u) => RETRACTION.has(String(u.type ?? '').toLowerCase()))) flags.push('retracted');
  if (w.event) flags.push('proceedings');

  return {
    found: true,
    source: 'crossref',
    authoritative: true,
    rawType: w.type ?? null,
    values: {
      doi: w.DOI.toLowerCase(),
      title: clean(w.title?.[0]),
      authors: people.map((p) => p.full).filter(Boolean).join(', '),
      containerTitle: clean(w['container-title']?.[0]),
      issn: issnMain ? formatIssn(issnMain) : '',
      year: year ? String(year) : '',
      volume: clean(w.volume),
      issue: clean(w.issue),
      pages: clean(w.page ?? w['article-number']),
      publisher: clean(w.publisher),
      workType: WORK_TYPE_LABEL[w.type ?? ''] ?? (w.type ?? ''),
    },
    people,
    identifiers: { issn: issnAll, isbn: isbnsOf(w) },
    flags,
    fetchedAt: new Date().toISOString(),
  };
}
