import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { lookupCache } from '@/server/db/schema';
import type { LookupResult } from './types';

const FOUND_DAYS = 30;
const MISS_DAYS = 1;

export async function readCache(kind: string, key: string): Promise<LookupResult | null> {
  const [row] = await db.select().from(lookupCache)
    .where(and(eq(lookupCache.kind, kind), eq(lookupCache.lookupKey, key)))
    .limit(1);
  if (!row) return null;
  const ageDays = (Date.now() - row.fetchedAt.getTime()) / 86_400_000;
  if (ageDays > (row.found ? FOUND_DAYS : MISS_DAYS)) return null;
  return row.result as LookupResult;
}

export async function writeCache(kind: string, key: string, result: LookupResult): Promise<void> {
  const now = new Date();
  await db.insert(lookupCache)
    .values({ kind, lookupKey: key, found: result.found, result, fetchedAt: now })
    .onConflictDoUpdate({
      target: [lookupCache.kind, lookupCache.lookupKey],
      set: { found: result.found, result, fetchedAt: now },
    });
}
