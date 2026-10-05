import { eq, asc } from 'drizzle-orm';
import { db } from '@/server/db';
import { masterListItems } from '@/server/db/schema';

const TTL_MS = 60_000;
let cache: { at: number; lists: Record<string, string[]> } | null = null;

export async function getAllLists(): Promise<Record<string, string[]>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.lists;
  const rows = await db.select().from(masterListItems)
    .where(eq(masterListItems.isActive, true))
    .orderBy(asc(masterListItems.listKey), asc(masterListItems.sortOrder));
  const lists: Record<string, string[]> = {};
  for (const r of rows) (lists[r.listKey] ??= []).push(r.value);
  cache = { at: Date.now(), lists };
  return lists;
}

export async function getList(listKey: string): Promise<string[]> {
  return (await getAllLists())[listKey] ?? [];
}

/** Call after any admin edit so the change is visible immediately. */
export function invalidateListCache() { cache = null; }
