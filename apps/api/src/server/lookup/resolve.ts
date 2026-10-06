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

/** Cache first; otherwise ask the register and remember the answer. Throws LookupUnavailable. */
export async function resolve(kind: LookupKind, raw: string): Promise<LookupResult> {
  const key = lookupKey(kind, raw);
  if (!key) return notFound();
  const cached = await readCache(kind, key);
  if (cached) return cached;
  const result = kind === 'doi' ? await resolveDoi(key) : await resolveBook(key);
  await writeCache(kind, key, result);
  return result;
}
