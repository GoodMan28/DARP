import { db } from './db';
import { masterListItems } from '@/server/db/schema';
import { invalidateListCache } from '@/server/records/masterLists';
import { bitListRows } from '../../scripts/data/bit-lists';

/** BIT's programmes, specialisations and designations in the dropdown lists. The test database's lists survive truncateAll(). */
export async function loadBitLists() {
  await db.insert(masterListItems).values(bitListRows()).onConflictDoNothing();
  invalidateListCache();
}
