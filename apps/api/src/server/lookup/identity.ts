import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import type { NameParts } from '@darp/shared/names';
import type { OrcidCheck } from '@darp/shared/contracts';

/**
 * Who a record's owner is, for matching against a published author or inventor list: the display
 * name (for messages), the name in parts, any other names from their ORCID record, and their ORCID iD
 * — only when ORCID's record carried the same name, so nobody can claim a stranger's iD.
 */
export interface OwnerIdentity {
  name: string;
  parts: NameParts | string;
  otherNames: string[];
  orcid: string | null;
  /** The account's own name and joining date, for fields that are worked out from them. */
  account?: { name: string; dateOfJoining: string | null };
}

/** A name alone, for callers that have no account behind them (and for tests). */
export function identityOfName(name: string): OwnerIdentity {
  return { name, parts: name, otherNames: [], orcid: null };
}

export async function ownerIdentity(userId: string, fallbackName: string): Promise<OwnerIdentity> {
  const [u] = await db.select({
    name: users.name, prefix: users.namePrefix, first: users.firstName, middle: users.middleName, last: users.lastName,
    orcid: users.orcid, orcidCheck: users.orcidCheck, dateOfJoining: users.dateOfJoining,
  }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return identityOfName(fallbackName);
  const check = u.orcidCheck as (OrcidCheck & { otherNames?: string[] }) | null;
  const trusted = !!(u.orcid && check?.found && check.nameMatches && !check.unchecked);
  return {
    name: u.name,
    parts: partsOf(u),
    otherNames: trusted ? check?.otherNames ?? [] : [],
    orcid: trusted ? u.orcid : null,
    account: { name: u.name, dateOfJoining: u.dateOfJoining ? String(u.dateOfJoining).slice(0, 10) : null },
  };
}

/**
 * The name in parts. An account made before names had parts keeps its whole name in `first`, and one
 * with no parts at all has only its display name: either is read as one piece.
 */
export function partsOf(u: { name: string; prefix: string; first: string; middle: string; last: string }): NameParts | string {
  if (!u.first.trim()) return u.name;
  return !u.middle && !u.last && /\s/.test(u.first) ? u.first : { prefix: u.prefix, first: u.first, middle: u.middle, last: u.last };
}
