/**
 * Loads the institute directory (AISHE and ROR).
 *
 *   npm run institutions:import -w @darp/api -- --aishe <file.json|file.csv> --ror <ror-data.csv> [--version "AISHE 2026-10, ROR v2.15"]
 *
 *  - AISHE: a JSON list ({aishe_code, name, state, district}) or a CSV with those columns (any case, or
 *    "AISHE Code", "Name", "State", "District"). The npm package `aishe-institutions-list` carries such a file.
 *  - ROR: the .csv inside the data dump from https://doi.org/10.5281/zenodo.6347574 (unzip it first).
 *
 * Either may be left out: BIT Mesra is always added. Run it again with newer files to update; entries
 * users added, and the review status of any entry, are left alone. Run it on the test database first.
 */
import { readFileSync } from 'node:fs';
import { pool } from '../src/server/db';
import { parseCsv } from '@darp/shared/journals';
import { csvRows } from '../src/server/institutions/csvStream';
import { aisheRowOf, buildDirectory, markAbsorbed, rorRowOf, storeInstitutions, type AisheRow, type RorRow } from '../src/server/institutions/import';

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const aishePath = arg('aishe');
const rorPath = arg('ror');
const version = arg('version') ?? `loaded ${new Date().toISOString().slice(0, 10)}`;

function readAishe(path: string): AisheRow[] {
  const text = readFileSync(path, 'utf8');
  const raw: Array<Record<string, unknown>> = path.toLowerCase().endsWith('.json')
    ? JSON.parse(text)
    : (() => { const [head, ...rest] = parseCsv(text); return rest.map((r) => Object.fromEntries((head ?? []).map((h, i) => [h, r[i] ?? '']))); })();
  return raw.map(aisheRowOf).filter((r): r is AisheRow => r !== null);
}

const aishe = aishePath ? readAishe(aishePath) : [];
console.log(aishePath ? `AISHE: ${aishe.length} rows read` : 'AISHE: none given');
const ror: RorRow[] = [];
if (rorPath) {
  for await (const row of csvRows(rorPath)) {
    const r = rorRowOf(row);
    if (r) ror.push(r);
  }
}
console.log(rorPath ? `ROR: ${ror.length} active organisations read` : 'ROR: none given');

const { entries, absorbed } = buildDirectory(aishe, ror, version);
const byScheme: Record<string, number> = {};
for (const e of entries.values()) byScheme[e.scheme] = (byScheme[e.scheme] ?? 0) + 1;
console.log('Entries:', byScheme);
const written = await storeInstitutions(entries.values());
console.log(`Stored ${written} entries (${version}).`);
const folded = await markAbsorbed(absorbed);
if (folded > 0) console.log(`${folded} entries from an earlier load are now part of an AISHE entry (marked merged).`);
await pool.end();
