import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aisheRowOf, buildEntries, rorRowOf, storeInstitutions, type AisheRow, type RorRow } from '@/server/institutions/import';
import { csvRows } from '@/server/institutions/csvStream';

const FIXTURES = join(__dirname, '..', 'fixtures', 'institutions');

/**
 * A handful of institutes for tests that fill in a form: U-0202 (BIT Mesra), U-0391 (BITS Pilani),
 * U-0050 (IIT Kharagpur), C-1111 (a college in Ranchi), ROR-04paris01 (Université de Paris, France),
 * ROR-05acme001 (a company). Call it after truncateAll(), which empties the directory.
 */
export async function loadTestInstitutes() {
  const aishe = (JSON.parse(readFileSync(join(FIXTURES, 'aishe.json'), 'utf8')) as Array<Record<string, unknown>>)
    .map(aisheRowOf).filter((r): r is AisheRow => r !== null);
  const ror: RorRow[] = [];
  for await (const row of csvRows(join(FIXTURES, 'ror.csv'))) {
    const r = rorRowOf(row);
    if (r) ror.push(r);
  }
  await storeInstitutions(buildEntries(aishe, ror, 'test files').values());
}
