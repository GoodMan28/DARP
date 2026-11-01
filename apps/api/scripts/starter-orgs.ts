/**
 * One-off (November 2026): organisations faculty will need at once that the institute directory lacks
 * (checked on 1 Nov 2026: SERB and MECON were not in it). Each is searched for first; one the directory
 * already has is left alone. With --apply the rest are added as approved entries (DARP codes).
 *
 *   npm run db:starter-orgs -w @darp/api             lists what would be added; changes nothing
 *   npm run db:starter-orgs -w @darp/api -- --apply  adds them
 */
import { db, pool } from '../src/server/db';
import { searchInstitutes } from '../src/server/institutions/service';
import { proposeInstitute } from '../src/server/institutions/propose';
import { systemActor } from '../src/server/lookup/system';
import { normInstitution } from '@darp/shared/institutions';
import { STARTER_ORGANISATIONS } from './data/starter-organisations';

const apply = process.argv.includes('--apply');
void db;

let added = 0;
let present = 0;
const actor = apply ? await systemActor() : null;
for (const org of STARTER_ORGANISATIONS) {
  const hits = await searchInstitutes(org.name, { limit: 5 });
  const same = hits.find((h) => normInstitution(h.name) === normInstitution(org.name) && h.country === org.country);
  if (same) {
    present += 1;
    console.log(`already there: ${org.name} -> ${same.code} ${same.name}`);
    continue;
  }
  added += 1;
  console.log(`${apply ? 'adding' : 'would add'}: ${org.name} (${org.kind}, ${org.country})${hits[0] ? `; closest now: ${hits[0].name}` : ''}`);
  if (actor) await proposeInstitute(actor, org);
}
console.log(apply ? `Done: ${added} added, ${present} already there.` : `${added} would be added, ${present} already there. Run again with --apply to add them.`);
await pool.end();
