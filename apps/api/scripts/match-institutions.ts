/**
 * Gives each institute typed before the directory existed ("IIT Delhi, Delhi, India") its directory entry,
 * where exactly one entry has that name. Nothing is guessed: no match, or several, is left alone for the
 * record's owner to choose when they next submit it.
 *
 *   npm run institutions:match -w @darp/api             lists what would be matched; changes nothing
 *   npm run institutions:match -w @darp/api -- --apply  writes it
 *
 * Either way it writes institutions-match-report.csv in this folder: every distinct text, where it was
 * typed, how many records have it, and the entry it matched (or why it did not).
 */
import { writeFileSync } from 'node:fs';
import { pool } from '../src/server/db';
import { systemActor } from '../src/server/lookup/system';
import { audit } from '../src/server/audit/log';
import { matchOldInstitutes } from '../src/server/records/institutionMatch';

const apply = process.argv.includes('--apply');
const actor = await systemActor();
const report = await matchOldInstitutes({ ...actor, role: 'admin' }, { apply });

const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
const NL = String.fromCharCode(10);
writeFileSync('institutions-match-report.csv', [
  ['module', 'field', 'typed text', 'records', 'result', 'entry'].map(csv).join(','),
  ...report.lines.map((l) => [l.moduleKey, l.field, l.text, l.records, l.state, l.codes.join(' ')].map(csv).join(',')),
].join(NL));

const table: Record<string, { matched: number; none: number; ambiguous: number }> = {};
for (const l of report.lines) {
  const row = (table[l.moduleKey] ??= { matched: 0, none: 0, ambiguous: 0 });
  row[l.state] += l.records;
}
console.log('Records by module (matched / not found / several entries):');
console.table(table);
const matched = report.lines.filter((l) => l.state === 'matched').reduce((n, l) => n + l.records, 0);
if (apply) {
  await audit({ actor, action: 'institution.match', entity: 'institution', meta: { records: report.applied, keyClashes: report.keyClashes } });
  console.log(`Done: ${report.applied} record(s) now have their directory entry.${report.keyClashes ? ` ${report.keyClashes} kept their old duplicate check (the new one would clash).` : ''}`);
} else {
  console.log(`${matched} record(s) would get their directory entry. Run again with --apply to write them.`);
}
console.log('Report: apps/api/institutions-match-report.csv');
await pool.end();
