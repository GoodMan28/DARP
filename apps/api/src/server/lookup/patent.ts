import { desc, eq, or } from 'drizzle-orm';
import { db } from '@/server/db';
import { patentApplications, patentGrants } from '@/server/db/schema';
import { normalisePatentNumber } from '@/server/records/patentNumber';
import { notFound, type LookupResult, type Person } from './types';
import { personName } from './patentJournal';

/** The Status of Patent master list's values. */
export const PATENT_APPLIED = 'Applied';
export const PATENT_PUBLISHED = 'Published';
export const PATENT_GRANTED = 'Granted';

/** Applied → Published → Granted: a record only ever moves forward. */
export const PATENT_STAGE: Record<string, number> = { Applied: 0, Published: 1, Granted: 2 };

/** An applicant printed as "THUBERT, Pascal" is a person; "Cisco Technology, Inc." is not. */
const COMPANY = /\b(inc|ltd|limited|llc|llp|corp|corporation|co|company|gmbh|ag|sa|university|institute|college|pvt|private|technologies|industries|foundation|trust|council|centre|center)\b/i;

/**
 * An Indian patent from the local index of the Patent Office Journal (patentIndex.ts), by its
 * application number or its patent number. Published only → status "Published", dated the day the
 * journal published it; granted → "Granted", dated the issue that published the grant. A pending
 * application is secret until it is published, so "Applied" can never be fetched: it is entered by hand.
 * Never touches the network.
 */
export async function resolvePatent(raw: string): Promise<LookupResult> {
  const n = normalisePatentNumber(raw, 'India');
  if ('error' in n) return notFound();
  const number = n.value;

  const [grant] = await db.select().from(patentGrants)
    .where(or(eq(patentGrants.patentNo, number), eq(patentGrants.applicationNo, number)))
    .orderBy(desc(patentGrants.grantPublishedDate)).limit(1);
  const [app] = await db.select().from(patentApplications)
    .where(eq(patentApplications.applicationNo, grant?.applicationNo ?? number)).limit(1);
  if (!app && !grant) return notFound();

  const isPerson = (a: string) => a.includes(',') && !COMPANY.test(a);
  const flags: string[] = [];
  let inventors = (app?.inventors as Array<{ name: string; bit: boolean }> | undefined) ?? [];
  const applicants = (app?.applicants as string[] | undefined) ?? [];
  if (app && inventors.length === 0) {
    // The journal sometimes prints "Inventor: NA" and names the inventors among the applicants.
    inventors = applicants.filter(isPerson).map((a) => ({ name: personName(a), bit: false }));
    if (inventors.length) flags.push('inventors-from-applicants');
  }
  if (!app) flags.push('grant-only');

  const people: Person[] = inventors.map((i) => ({
    given: '', family: '', full: i.name, orcid: null,
    // An address elsewhere may be a home address: only a BIT address says anything.
    bitAffiliated: i.bit ? true : null,
  }));

  return {
    found: true,
    source: 'ipindia',
    authoritative: true,
    rawType: grant ? 'patent-grant' : 'patent-application',
    values: {
      title: app?.title || grant?.title || '',
      inventors: inventors.map((i) => i.name).join(', '),
      applicant: applicants.length
        ? applicants.map((a) => (isPerson(a) ? personName(a) : a)).join(', ')
        : (grant?.patentee ?? ''),
      country: 'India',
      filedDate: app?.filedDate ?? grant?.filedDate ?? '',
      patentStatus: grant ? PATENT_GRANTED : PATENT_PUBLISHED,
      statusDate: grant ? grant.grantPublishedDate : (app?.publishedDate ?? ''),
      // The application number always wins over a grant number typed in its place.
      applicationNo: app?.applicationNo ?? grant?.applicationNo ?? number,
      patentNo: grant?.patentNo ?? '',
      publishedDate: app?.publishedDate ?? grant?.publishedDate ?? '',
      grantDate: grant?.grantPublishedDate ?? '',
      workType: grant ? 'Granted patent' : 'Published patent application',
    },
    people,
    identifiers: { issn: [], isbn: [] },
    flags,
    fetchedAt: new Date().toISOString(),
  };
}
