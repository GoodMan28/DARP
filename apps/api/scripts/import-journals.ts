/**
 * Loads the journal lists that quartile and indexing are derived from, from the command line.
 * IQAC normally uses Administration → Journal lists instead; this is the same import for scripts.
 *
 *   npm run journals:import -- --sjr  <scimagojr-2024.csv> --year 2024
 *   npm run journals:import -- --list SCIE <mjl-scie.csv> --year 2026
 *
 * SJR: download from https://www.scimagojr.com/journalrank.php ("Download data", choose the year).
 * Web of Science: download each collection (SCIE, SSCI, AHCI, ESCI) from https://mjl.clarivate.com.
 * The list name must be a value of IQAC's "indexingTypes" master list.
 */
import { readFileSync } from 'node:fs';
import { pool } from '../src/server/db';
import { getList } from '../src/server/records/masterLists';
import { storeSjrRows, storeListRows } from '../src/server/lookup/journals';
import { parseCsv, extractSjrRows, extractListRows } from '@darp/shared/journals';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const year = Number(arg('--year'));
  if (!Number.isInteger(year) || year < 1999 || year > 2100) throw new Error('Give --year YYYY');
  const sjrFile = arg('--sjr');
  const listName = arg('--list');
  const listFile = listName ? process.argv[process.argv.indexOf('--list') + 2] : undefined;

  if (sjrFile) {
    const extracted = extractSjrRows(parseCsv(readFileSync(sjrFile, 'utf8')));
    if (!extracted.ok) throw new Error(extracted.message);
    await storeSjrRows(year, extracted.rows);
    console.error(`SJR ${year}: ${extracted.rows.length} ISSN rows from ${extracted.journals} journals`);
  } else if (listName && listFile) {
    const allowed = await getList('indexingTypes');
    if (!allowed.includes(listName)) {
      throw new Error(`"${listName}" is not in the indexingTypes master list: ${allowed.join(', ')}`);
    }
    const extracted = extractListRows(parseCsv(readFileSync(listFile, 'utf8')));
    if (!extracted.ok) throw new Error(extracted.message);
    await storeListRows(listName, year, extracted.rows);
    console.error(`${listName} ${year}: ${extracted.rows.length} ISSN rows from ${extracted.journals} journals`);
  } else {
    throw new Error('Use --sjr <file> --year YYYY, or --list <NAME> <file> --year YYYY');
  }
  await pool.end();
}

main().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await pool.end(); process.exit(1); });
