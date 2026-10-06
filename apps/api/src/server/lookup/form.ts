import type { LookupFillPayload } from '@darp/shared/contracts';
import type { SessionUser } from '@/server/auth/session';
import { canCreateIn } from '@/server/auth/permissions';
import { mustGetModule, activeCycle, ServiceError } from '@/server/records/service';
import { applyLookup } from './apply';
import { resolve } from './resolve';
import { isLookupUnavailable } from './http';
import { normaliseDoiInput } from './doi';
import { isbn13 } from './isbn';
import type { LookupResult } from './types';

/** Which of the module's identifier fields this input belongs in, judged by the field's type. */
function fieldFor(m: ReturnType<typeof mustGetModule>, identifier: string) {
  for (const key of m.lookup?.idFields ?? []) {
    const f = m.fields.find((x) => x.key === key);
    if (!f) continue;
    if (f.type === 'doi' && normaliseDoiInput(identifier)) return f;
    if (f.type === 'isbn' && isbn13(identifier)) return f;
  }
  return null;
}

export async function lookupForForm(
  actor: SessionUser, moduleKey: string, identifier: string,
): Promise<LookupFillPayload> {
  const m = mustGetModule(moduleKey);
  if (!m.lookup) throw new ServiceError('NOT_FOUND', 'This module has no automatic lookup.');
  if (!canCreateIn(actor, m)) throw new ServiceError('FORBIDDEN', 'This module is not yours to add to.');

  const field = fieldFor(m, identifier);
  if (!field) {
    throw new ServiceError('VALIDATION', `That does not look like a valid ${m.lookup.idLabel}.`, {
      identifier: `Check the ${m.lookup.idLabel} and try again.`,
    });
  }
  const typed = { [field.key]: identifier.trim() };
  const byHand = (note: string): LookupFillPayload => ({
    found: false, source: null, authoritative: false, fill: typed, locked: [], notes: [note],
  });

  let result: LookupResult;
  try {
    result = await resolve(m.lookup.kind, identifier);
  } catch (e) {
    if (isLookupUnavailable(e)) {
      return byHand('The publisher register could not be reached just now. Try again in a minute, or fill in the details by hand — the record will then be checked by the verifying office.');
    }
    throw e;
  }
  if (!result.found) {
    return byHand(`No published record was found for this ${m.lookup.idLabel}. Check it, or fill in the details by hand — the record will then be checked by the verifying office.`);
  }

  const cycle = await activeCycle();
  const applied = await applyLookup(m, typed, { ownerName: actor.name, cycle });
  const fill: Record<string, string> = {};
  for (const f of m.fields) {
    const v = applied.data[f.key];
    if (typeof v === 'string' && v !== '') fill[f.key] = v;
  }
  const locked = result.authoritative
    ? m.fields.filter((f) => f.autofill?.locked && (fill[f.key] || f.autofill.lockWhenEmpty)).map((f) => f.key)
    : [];
  const notes = applied.eligible
    ? ['Everything matches the published record. When you press "Save and submit" the record is approved straight away — no manual check is needed.']
    : [
      ...(applied.verification?.reasons ?? []),
      'You can still submit: the verifying office will check it before it counts as approved.',
    ];
  return { found: true, source: result.source, authoritative: result.authoritative, fill, locked, notes };
}
