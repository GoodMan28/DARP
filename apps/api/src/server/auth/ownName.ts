import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { ServiceError } from '@/server/records/service';
import { syncProfileFromAccount } from '@/server/records/profileSync';
import { checkOrcid } from '@/server/lookup/orcid';
import { partsOf } from '@/server/lookup/identity';
import { SYSTEM_EMAIL } from '@/server/lookup/system';
import { namePartsFrom, NAME_FIELDS } from './accounts';
import type { SessionUser } from './session';
import type { z } from 'zod';

type NameBody = { [K in keyof typeof NAME_FIELDS]?: z.infer<(typeof NAME_FIELDS)[K]> };

/**
 * A person's own name, in parts. The name is what author and inventor lists are matched against, so a
 * change is audited by the caller with the old and the new, and a saved ORCID iD is checked again
 * against the new name: an iD checked under the old name must not keep confirming the new one.
 * Only the name changes here; e-mail, role, department and joining date stay with IQAC.
 */
export async function saveOwnName(actor: SessionUser, body: NameBody) {
  const [u] = await db.select({
    email: users.email, name: users.name, prefix: users.namePrefix, first: users.firstName, middle: users.middleName,
    last: users.lastName, orcid: users.orcid, dateOfJoining: users.dateOfJoining,
  }).from(users).where(eq(users.id, actor.id)).limit(1);
  if (!u) throw new ServiceError('NOT_FOUND', 'No such account.');
  if (u.email === SYSTEM_EMAIL) throw new ServiceError('FORBIDDEN', 'This account cannot be renamed.');

  const named = namePartsFrom(body);
  if (!named.ok) throw new ServiceError('VALIDATION', 'Check the name.', named.fields);

  const set: Partial<typeof users.$inferInsert> = {
    name: named.name, namePrefix: named.parts.prefix, firstName: named.parts.first,
    middleName: named.parts.middle, lastName: named.parts.last, updatedAt: new Date(),
  };
  if (u.orcid) set.orcidCheck = await checkOrcid(u.orcid, partsOf({
    name: named.name, prefix: named.parts.prefix, first: named.parts.first, middle: named.parts.middle, last: named.parts.last,
  }));
  await db.update(users).set(set).where(eq(users.id, actor.id));
  await syncProfileFromAccount(actor.id, named.name, u.dateOfJoining ? String(u.dateOfJoining).slice(0, 10) : null);
  return {
    before: { name: u.name, prefix: u.prefix, first: u.first, middle: u.middle, last: u.last },
    after: { name: named.name, prefix: named.parts.prefix, first: named.parts.first, middle: named.parts.middle, last: named.parts.last },
  };
}
