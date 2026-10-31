/**
 * A person's name in parts. The display name ("Prof. (Dr.) Sanjay Kumar Mishra") is built from them,
 * and author matching reads the parts, never a guess at where one name ends and the next begins.
 * Middle and last names are optional: some Indian names have no surname.
 */
export interface NameParts {
  prefix: string;
  first: string;
  middle: string;
  last: string;
}

export const NAME_PREFIXES = ['Dr.', 'Prof.', 'Prof. (Dr.)', 'Mr.', 'Ms.', 'Mrs.', 'Er.'] as const;

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** "Prof. (Dr.)" + "Sanjay" + "Kumar" + "Mishra" → "Prof. (Dr.) Sanjay Kumar Mishra". */
export function composeName(p: Partial<NameParts>): string {
  return [p.prefix, p.first, p.middle, p.last].map(clean).filter(Boolean).join(' ');
}

const PREFIX_RE = /^(prof\.?\s*\(dr\.?\)|prof(essor)?\.?|dr\.?|mr\.?|mrs\.?|ms\.?|miss|er\.?|shri|smt\.?)\s+/i;

/**
 * Best reading of a name typed in one piece, for accounts made before names had parts:
 * a known prefix, then the first word, the last word, and anything between as the middle name.
 */
export function splitName(full: string): NameParts {
  let rest = clean(full);
  let prefix = '';
  const m = rest.match(PREFIX_RE);
  if (m) {
    const raw = m[1]!.toLowerCase().replace(/\s+/g, '');
    prefix = raw.startsWith('prof') && raw.includes('dr') ? 'Prof. (Dr.)'
      : raw.startsWith('prof') ? 'Prof.'
        : raw.startsWith('dr') ? 'Dr.'
          : raw.startsWith('mrs') ? 'Mrs.'
            : raw.startsWith('mr') ? 'Mr.'
              : raw.startsWith('ms') || raw === 'miss' ? 'Ms.'
                : raw.startsWith('er') ? 'Er.' : m[1]!;
    rest = rest.slice(m[0].length);
  }
  const words = rest.split(' ').filter(Boolean);
  if (words.length <= 1) return { prefix, first: words[0] ?? '', middle: '', last: '' };
  return { prefix, first: words[0]!, middle: words.slice(1, -1).join(' '), last: words[words.length - 1]! };
}
