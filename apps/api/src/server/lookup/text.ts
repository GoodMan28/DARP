/** Publisher metadata carries HTML tags and entities. Return plain, single-spaced text. */
export function clean(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Encode a DOI for a URL path, keeping its slashes. */
export function encodePath(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}
