import { eq, asc } from 'drizzle-orm';
import { db } from '@/server/db';
import { masterListItems } from '@/server/db/schema';

const TTL_MS = 60_000;
interface Cached {
  at: number;
  /** Every active value of each list once, in order (a name under two parents appears once). */
  lists: Record<string, string[]>;
  /** The active values of each list under each parent: tree[list][parent]. */
  tree: Record<string, Record<string, string[]>>;
}
let cache: Cached | null = null;

async function load(): Promise<Cached> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const rows = await db.select().from(masterListItems)
    .where(eq(masterListItems.isActive, true))
    .orderBy(asc(masterListItems.listKey), asc(masterListItems.sortOrder));
  const lists: Record<string, string[]> = {};
  const tree: Record<string, Record<string, string[]>> = {};
  for (const r of rows) {
    const all = (lists[r.listKey] ??= []);
    if (!all.includes(r.value)) all.push(r.value);
    const under = ((tree[r.listKey] ??= {})[r.parent] ??= []);
    under.push(r.value);
  }
  cache = { at: Date.now(), lists, tree };
  return cache;
}

export async function getAllLists(): Promise<Record<string, string[]>> {
  return (await load()).lists;
}

export async function getList(listKey: string): Promise<string[]> {
  return (await getAllLists())[listKey] ?? [];
}

/** The values of each list under each parent (specialisations of each programme). */
export async function getListTree(): Promise<Record<string, Record<string, string[]>>> {
  return (await load()).tree;
}

/** A list's values and the parent each belongs to: { 'M.Tech.': 'PG' }. A name under two parents keeps the first. */
export async function getParents(listKey: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [parent, values] of Object.entries((await load()).tree[listKey] ?? {})) {
    for (const v of values) if (!(v in out)) out[v] = parent;
  }
  return out;
}

/** Call after any admin edit so the change is visible immediately. */
export function invalidateListCache() { cache = null; }
