import { and, eq, gt, ne, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { institutions } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { ServiceError } from '@/server/records/service';
import { getList } from '@/server/records/masterLists';
import { INSTITUTE_KINDS, NOT_A_COUNTRY, normInstitution, type InstituteHit } from '@darp/shared/institutions';
import { hitOf } from './service';

/** How many organisations one person may add in a day: enough for real use, too few to flood the list. */
export const DAILY_LIMIT = 20;

export interface ProposedInstitute { name: string; kind: string; country: string; city?: string | null; state?: string | null; website?: string | null }

/**
 * An organisation the directory lacks, added by the person who needs it. It can be chosen at once and
 * its record saves normally; IQAC reviews it afterwards (approve it, or merge it into the entry it
 * duplicates). An IQAC administrator's own additions need no review. Naming one the directory already
 * has (same name, same country) returns that entry instead of making a second.
 */
export async function proposeInstitute(actor: SessionUser, input: ProposedInstitute): Promise<InstituteHit> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 200) throw new ServiceError('VALIDATION', 'Enter the full name.', { name: 'Enter the full name, 3 to 200 characters.' });
  const kind = INSTITUTE_KINDS.find((k) => k.label === input.kind)?.kind;
  if (!kind) throw new ServiceError('VALIDATION', 'Choose what kind of organisation it is.', { kind: 'Choose one of the listed kinds.' });
  const countries = (await getList('countries')).filter((c) => !NOT_A_COUNTRY.includes(c));
  if (!countries.includes(input.country)) throw new ServiceError('VALIDATION', 'Choose the country.', { country: 'Choose a country from the list.' });
  const city = (input.city ?? '').trim().slice(0, 120) || null;
  const state = input.country === 'India' ? (input.state ?? '').trim().slice(0, 120) || null : null;
  const website = (input.website ?? '').trim().slice(0, 300) || null;

  const norm = normInstitution(name);
  const same = await db.select().from(institutions)
    .where(and(eq(institutions.country, input.country), ne(institutions.status, 'merged'), sql`${institutions.searchText} like ${`%${norm.replace(/[!%_]/g, (c) => `!${c}`)}%`} escape '!'`))
    .limit(50);
  const twin = same.find((r) => normInstitution(r.name) === norm || r.aliases.some((a) => normInstitution(a) === norm));
  if (twin) return hitOf(twin);

  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(institutions)
    .where(and(eq(institutions.addedBy, actor.id), gt(institutions.createdAt, sql`now() - interval '1 day'`)));
  if (actor.role !== 'admin' && n >= DAILY_LIMIT) {
    throw new ServiceError('VALIDATION', `You have added ${DAILY_LIMIT} organisations today. Ask IQAC to add the rest.`);
  }

  const [{ seq } = { seq: 0 }] = (await db.execute(sql`select nextval('institutions_local_seq')::int as seq`)).rows as Array<{ seq: number }>;
  const code = `DARP-${String(seq).padStart(6, '0')}`;
  const [row] = await db.insert(institutions).values({
    code, scheme: 'local', name, aliases: [], city, state, country: input.country, kind, website,
    searchText: normInstitution([name, code].join(' ')),
    status: actor.role === 'admin' ? 'active' : 'pending', addedBy: actor.id,
  }).returning();
  return hitOf(row!);
}

export interface PendingInstitute extends InstituteHit { kind: string | null; addedBy: string | null; addedAt: string; records: number }
