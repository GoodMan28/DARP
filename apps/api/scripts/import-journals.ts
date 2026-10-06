/**
 * Loads the journal lists that quartile and indexing are derived from. Run once a year per list.
 *
 *   npm run journals:import -- --sjr  <scimagojr-2024.csv> --year 2024
 *   npm run journals:import -- --list SCIE <mjl-scie.csv> --year 2026
 *
 * SJR: download from https://www.scimagojr.com/journalrank.php ("Download data", choose the year).
 * Web of Science: download each collection (SCIE, SSCI, AHCI, ESCI) from https://mjl.clarivate.com.
 * The list name must be a value of IQAC's "indexingTypes" master list.
 */
import { readFileSync } from 'node:fs';
import { eq, and, sql } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { journalMetrics, journalIndexListings, lookupCache, masterListItems } from '../src/server/db/schema';
import { normIssn } from '../src/server/lookup/journals';
import { parseCsv } from '../src/server/lookup/csv';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function insertBatched<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += 500) await insert(rows.slice(i, i + 500));
}

async function main() {
  const year = Number(arg('--year'));
  if (!Number.isInteger(year) || year < 1999 || year > 2100) throw new Error('Give --year YYYY');
  const sjrFile = arg('--sjr');
  const listName = arg('--list');
  const listFile = listName ? process.argv[process.argv.indexOf('--list') + 2] : undefined;

  if (sjrFile) {
    const [header, ...data] = parseCsv(readFileSync(sjrFile, 'utf8'));
    const col = (name: string) => header!.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
    const iIssn = col('Issn'); const iQ = col('SJR Best Quartile'); const iTitle = col('Title'); const iType = col('Type');
    if ([iIssn, iQ, iTitle, iType].some((i) => i < 0)) {
      throw new Error(`Not an SJR file. Headers found: ${header!.join(' | ')}`);
    }
    const rows = data.flatMap((r) => {
      const q = (r[iQ] ?? '').trim();
      return (r[iIssn] ?? '').split(',').map((s) => normIssn(s)).filter((x): x is string => x !== null)
        .map((issn) => ({
          issn, year, title: (r[iTitle] ?? '').trim(), sourceType: (r[iType] ?? '').trim().toLowerCase(),
          quartile: /^Q[1-4]$/.test(q) ? q : null,
        }));
    });
    await insertBatched(rows, (batch) => db.insert(journalMetrics).values(batch).onConflictDoUpdate({
      target: [journalMetrics.issn, journalMetrics.year],
      set: { quartile: sql`excluded.quartile`, title: sql`excluded.title`, sourceType: sql`excluded.source_type` },
    }));
    console.error(`SJR ${year}: ${rows.length} ISSN rows from ${data.length} journals`);
  } else if (listName && listFile) {
    const allowed = await db.select({ value: masterListItems.value }).from(masterListItems)
      .where(and(eq(masterListItems.listKey, 'indexingTypes'), eq(masterListItems.isActive, true)));
    if (!allowed.some((a) => a.value === listName)) {
      throw new Error(`"${listName}" is not in the indexingTypes master list: ${allowed.map((a) => a.value).join(', ')}`);
    }
    const [header, ...data] = parseCsv(readFileSync(listFile, 'utf8'));
    const issnCols = header!.map((h, i) => (/issn/i.test(h) ? i : -1)).filter((i) => i >= 0);
    const iTitle = header!.findIndex((h) => /title/i.test(h));
    if (issnCols.length === 0) throw new Error(`No ISSN column. Headers found: ${header!.join(' | ')}`);
    const rows = data.flatMap((r) => issnCols.map((i) => normIssn(r[i] ?? '')).filter((x): x is string => x !== null)
      .map((issn) => ({ issn, listName, year, title: iTitle >= 0 ? (r[iTitle] ?? '').trim() : '' })));
    await insertBatched(rows, (batch) => db.insert(journalIndexListings).values(batch).onConflictDoNothing());
    console.error(`${listName} ${year}: ${rows.length} ISSN rows from ${data.length} journals`);
  } else {
    throw new Error('Use --sjr <file> --year YYYY, or --list <NAME> <file> --year YYYY');
  }

  // Quartile and indexing are cached with each DOI; forget them so the next lookup uses the new lists.
  await db.delete(lookupCache).where(eq(lookupCache.kind, 'doi'));
  await pool.end();
}

main().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await pool.end(); process.exit(1); });
