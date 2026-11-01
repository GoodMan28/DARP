import type { ProposedInstitute } from '../../src/server/institutions/propose';

/**
 * Organisations BIT faculty name often (funders, public-sector bodies) that the AISHE and ROR directories
 * lacked when checked on 1 November 2026. A name already in the directory is skipped when this is loaded.
 */
export const STARTER_ORGANISATIONS: ProposedInstitute[] = [
  { name: 'Science and Engineering Research Board', aliases: ['SERB'], kind: 'Government or funder', country: 'India', city: 'New Delhi' },
  { name: 'Anusandhan National Research Foundation', aliases: ['ANRF'], kind: 'Government or funder', country: 'India', city: 'New Delhi' },
  { name: 'MECON Limited', kind: 'Company', country: 'India', city: 'Ranchi', state: 'Jharkhand' },
];
