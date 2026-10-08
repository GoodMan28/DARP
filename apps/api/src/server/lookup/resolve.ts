import type { LookupKind } from '@darp/shared/modules/types';
import type { LookupResult } from './types';
import { notFound } from './types';
import { readCache, writeCache } from './cache';
import { normaliseDoiInput, resolveDoi } from './doi';
import { resolveBook } from './book';
import { isbn13 } from './isbn';

/** The normalised identifier used as the cache key, or null when the input is not valid. */
export function lookupKey(kind: LookupKind, raw: string): string | null {
  if (kind === 'doi') return normaliseDoiInput(raw);
  return normaliseDoiInput(raw) ?? isbn13(raw);   // book: DOI or ISBN
}

/**
 * Bump whenever the shape or meaning of a LookupResult changes (e.g. how the quartile is written):
 * answers cached under an older version are then simply not found, instead of being served in a
 * format the forms no longer accept.
 */
const CACHE_VERSION = 'v3';

/** Cache first; otherwise ask the register and remember the answer. Throws LookupUnavailable. */
export async function resolve(kind: LookupKind, raw: string): Promise<LookupResult> {
  const key = lookupKey(kind, raw);
  if (!key) return notFound();
  const cacheKey = `${CACHE_VERSION}:${key}`;
  const cached = await readCache(kind, cacheKey);
  if (cached) return cached;
  const result = kind === 'doi' ? await resolveDoi(key) : await resolveBook(key);
  await writeCache(kind, cacheKey, result);
  return result;
}
