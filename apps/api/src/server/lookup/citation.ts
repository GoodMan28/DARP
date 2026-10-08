import type { MetaKey, ModuleConfig } from '@darp/shared/modules/types';
import type { LookupResult } from './types';

/**
 * The start of a Chicago author-date reference. A work registered without authors or editors
 * (some Elsevier books) starts with its title, as Chicago has it, not with an empty author.
 */
function lead(authors: string, year: string, title: string): string {
  return authors ? `${authors}. ${year}. ${title}` : `${title} ${year}.`;
}

/** Chicago author-date, rebuilt from the FINAL values on every save (decision D7). */
export function buildCitation(m: ModuleConfig, data: Record<string, unknown>, r: LookupResult): string {
  const get = (from: MetaKey): string => {
    const f = m.fields.find((x) => x.autofill?.from === from);
    const v = f ? data[f.key] : undefined;
    return String(v ?? r.values[from] ?? '').trim();
  };
  const authors = get('authors');
  const year = get('year');
  const doi = r.values.doi ?? '';
  const link = doi ? ` https://doi.org/${doi}.` : '';
  if (m.lookup?.kind === 'book') {
    const chapter = get('chapterTitle');
    const book = get('bookTitle');
    const pages = get('pages');
    const publisher = get('publisher');
    const where = `${book}${pages ? `, ${pages}` : ''}. ${publisher}.${link}`;
    if (chapter) return `${lead(authors, year, `"${chapter}."`)} In ${where}`;
    return `${lead(authors, year, `${book}.`)} ${publisher}.${link}`;
  }
  const volume = get('volume');
  const issue = get('issue');
  const pages = get('pages');
  return `${lead(authors, year, `"${get('title')}."`)} ${get('containerTitle')}`
    + `${volume ? ` ${volume}` : ''}${issue ? ` (${issue})` : ''}${pages ? `: ${pages}` : ''}.${link}`;
}
