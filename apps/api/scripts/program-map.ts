/**
 * One-off (November 2026): Program, Specialisation and Branch became dropdowns. This matches the text
 * people typed earlier ("BTech", "M.Tech CSE") to BIT's lists, in Students Guided and Student Mentorship,
 * and sets Level from the programme.
 *
 *   npm run db:program-map -w @darp/api             lists what would change; changes nothing
 *   npm run db:program-map -w @darp/api -- --apply  writes the exact matches
 *
 * Only exact matches (after ignoring case, dots and spaces, and a few short forms such as CSE) are written.
 * Anything else stays as typed; the owner chooses from the list the next time they open it.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { masterListItems, records } from '../src/server/db/schema';

const apply = process.argv.includes('--apply');
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

// What people type for a branch, by its short form.
const SHORT: Record<string, string> = {
  cse: 'computer science and engineering', cs: 'computer science and engineering', ece: 'electronics and communication engineering',
  eee: 'electrical and electronics engineering', ee: 'electrical engineering', me: 'mechanical engineering',
  mech: 'mechanical engineering', ce: 'civil engineering', civil: 'civil engineering', che: 'chemical engineering',
  it: 'information technology', bt: 'biotechnology', bio: 'biotechnology', pie: 'production and industrial engineering',
  production: 'production and industrial engineering', aiml: 'artificial intelligence and machine learning',
};
const expand = (s: string) => norm(SHORT[norm(s)] ?? s);

const items = await db.select().from(masterListItems).where(and(eq(masterListItems.isActive, true), inArray(masterListItems.listKey, ['programmes', 'specialisations'])));
const programmes = items.filter((i) => i.listKey === 'programmes');
if (programmes.length === 0) { console.log('The programmes list is empty: run npm run db:bit-lists -- --apply first.'); await pool.end(); process.exit(0); }
const level = new Map(programmes.map((p) => [p.value, p.parent]));

let total = 0;
for (const [moduleKey, specKey] of [['studentsguided', 'specialisation'], ['mentorship', 'branch']] as const) {
  const rows = await db.select({ id: records.id, data: records.data }).from(records)
    .where(and(eq(records.moduleKey, moduleKey), isNull(records.deletedAt)));
  let matched = 0;
  let left = 0;
  for (const r of rows) {
    const d = (r.data ?? {}) as Record<string, unknown>;
    const programme = programmes.find((p) => norm(p.value) === norm(d.program));
    if (!programme) { left += 1; console.log(`${moduleKey}: left as typed: program "${String(d.program ?? '')}"`); continue; }
    const under = items.filter((i) => i.listKey === 'specialisations' && i.parent === programme.value);
    const typed = String(d[specKey] ?? '').trim();
    const spec = typed ? under.find((s) => norm(s.value) === expand(typed)) : undefined;
    if (typed && !spec) console.log(`${moduleKey}: "${programme.value}" matched, ${specKey} "${typed}" left as typed`);
    const next = { ...d, program: programme.value, ...(spec ? { [specKey]: spec.value } : {}), ...(moduleKey === 'studentsguided' ? { level: level.get(programme.value) } : {}) };
    matched += 1;
    if (apply && JSON.stringify(next) !== JSON.stringify(d)) await db.update(records).set({ data: next }).where(eq(records.id, r.id));
  }
  total += matched;
  console.log(`${moduleKey}: ${rows.length} record(s), ${matched} programme(s) matched, ${left} left as typed.`);
}
console.log(apply ? `Updated records with ${total} matched programme(s).` : 'Nothing was changed. Run again with --apply to write the matches.');
await pool.end();
