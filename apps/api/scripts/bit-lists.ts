/**
 * Loads BIT Mesra's own departments, designations, programmes and specialisations into the dropdowns
 * (the data is in scripts/data/bit-lists.ts, with its sources).
 *
 *   npm run db:bit-lists -w @darp/api             lists what would be added or renamed; changes nothing
 *   npm run db:bit-lists -w @darp/api -- --apply  writes it
 *
 * Only reference rows change, never a record. Departments are matched by code and renamed to BIT's own
 * wording; a list item that is already there is left as it is, and nothing is switched off.
 */
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { departments, masterListItems } from '../src/server/db/schema';
import { DEPARTMENTS, bitListRows } from './data/bit-lists';

const apply = process.argv.includes('--apply');

const have = await db.select().from(departments);
let renamed = 0;
let added = 0;
for (const [code, name] of DEPARTMENTS) {
  const found = have.find((d) => d.code === code);
  if (!found) {
    added += 1;
    console.log(`department added: ${code} ${name}`);
    if (apply) await db.insert(departments).values({ code, name });
  } else if (found.name !== name) {
    renamed += 1;
    console.log(`department renamed: ${code} "${found.name}" -> "${name}"`);
    if (apply) await db.update(departments).set({ name }).where(eq(departments.id, found.id));
  }
}
const unlisted = have.filter((d) => !DEPARTMENTS.some(([c]) => c === d.code));
for (const d of unlisted) console.log(`department kept (not in BIT's list): ${d.code} ${d.name}`);

const items = await db.select().from(masterListItems);
const seen = new Set(items.map((i) => `${i.listKey}|${i.parent}|${i.value}`));
const perList: Record<string, number> = {};
const missingParents: string[] = [];
const rows = bitListRows().filter((r) => !seen.has(`${r.listKey}|${r.parent}|${r.value}`));
for (const r of rows) {
  if (r.listKey === 'programmes' && !items.some((i) => i.listKey === 'studentLevels' && i.value === r.parent)) missingParents.push(`${r.value} (needs level ${r.parent})`);
  perList[r.listKey] = (perList[r.listKey] ?? 0) + 1;
}
// New items go after the ones already in a list, so nothing IQAC ordered moves.
const lastOrder = (listKey: string) => Math.max(0, ...items.filter((i) => i.listKey === listKey).map((i) => i.sortOrder));
if (apply && rows.length > 0) {
  const offset: Record<string, number> = {};
  for (const r of rows) offset[r.listKey] ??= lastOrder(r.listKey);
  await db.insert(masterListItems).values(rows.map((r) => ({ ...r, sortOrder: offset[r.listKey]! + r.sortOrder }))).onConflictDoNothing();
}
console.log('list items to add:', perList);
if (missingParents.length) console.log('WARNING: these programmes need the level list first (run npm run db:seed):', missingParents.join(', '));
console.log(apply
  ? `Done: ${added} department(s) added, ${renamed} renamed, ${rows.length} list item(s) added.`
  : `${added} department(s) would be added, ${renamed} renamed, ${rows.length} list item(s) added. Run again with --apply to write them.`);
await pool.end();
