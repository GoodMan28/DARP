import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aisheRowOf, buildEntries, rorRowOf, storeInstitutions, type AisheRow, type RorRow, type NewInstitution } from '@/server/institutions/import';
import { normInstitution } from '@darp/shared/institutions';
import { csvRows } from '@/server/institutions/csvStream';

const FIXTURES = join(__dirname, '..', 'fixtures', 'institutions');

/**
 * A handful of institutes for tests that fill in a form: U-0202 (BIT Mesra), U-0391 (BITS Pilani),
 * U-0050 (IIT Kharagpur), C-1111 (a college in Ranchi), ROR-04paris01 (Université de Paris, France),
 * ROR-05acme001 (a company), ROR-07serb001 (SERB, a government funder) and ROR-08tata001 (Tata Steel, a company).
 * Call it after truncateAll(), which empties the directory.
 */
export async function loadTestInstitutes() {
  const aishe = (JSON.parse(readFileSync(join(FIXTURES, 'aishe.json'), 'utf8')) as Array<Record<string, unknown>>)
    .map(aisheRowOf).filter((r): r is AisheRow => r !== null);
  const ror: RorRow[] = [];
  for await (const row of csvRows(join(FIXTURES, 'ror.csv'))) {
    const r = rorRowOf(row);
    if (r) ror.push(r);
  }
  const extra = (code: string, name: string, kind: string): NewInstitution => ({
    code, scheme: 'ror', name, aliases: [], city: 'Delhi', state: null, country: 'India', countryCode: 'IN', kind,
    searchText: normInstitution(`${name} ${code}`), status: 'active',
  });
  await storeInstitutions([
    ...buildEntries(aishe, ror, 'test files').values(),
    extra('ROR-07serb001', 'Science and Engineering Research Board', 'government, funder'),
    extra('ROR-08tata001', 'Tata Steel Limited', 'company'),
  ]);
}
