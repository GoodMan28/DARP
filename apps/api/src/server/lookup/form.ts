import type { LookupFillPayload } from '@darp/shared/contracts';
import type { SessionUser } from '@/server/auth/session';
import { canCreateIn } from '@/server/auth/permissions';
import { mustGetModule, activeCycle, ServiceError } from '@/server/records/service';
import { applyLookup, ownerMissingFromAuthors, outsideCycle, workTypeNote, yearNote } from './apply';
import { resolve } from './resolve';
import { isLookupUnavailable } from './http';
import { normaliseDoiInput } from './doi';
import { isbn13 } from './isbn';
import type { LookupResult } from './types';
import { getModule } from '@darp/shared/modules';

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
    ? m.fields.filter((f) => f.autofill?.alwaysLocked || (f.autofill?.locked && fill[f.key])).map((f) => f.key)
    : [];
  // In the wrong module (or a preprint): that is the whole story — say only that, and where it goes.
  if (applied.misplaced) {
    const target = applied.misplaced.moveTo ? getModule(applied.misplaced.moveTo) : undefined;
    return {
      found: true, source: result.source, authoritative: result.authoritative, fill, locked,
      notes: [applied.misplaced.message],
      moveTo: target ? { moduleKey: target.key, name: target.name } : null,
    };
  }

  const yearHint = yearNote(result);
  // Out of the cycle: say that — after explaining what the DOI is, if it is not a single paper.
  const outside = outsideCycle(m, applied.data, cycle, applied.fetched);
  if (outside) {
    const typeNote = workTypeNote(m, result);
    const notes = [typeNote, yearHint, outside.message].filter((n): n is string => !!n);
    return { found: true, source: result.source, authoritative: result.authoritative, fill, locked, notes };
  }

  const reasons = applied.verification?.reasons ?? [];
  const nameMissing = ownerMissingFromAuthors(m, applied.data, actor.name);
  const notes: string[] = yearHint ? [yearHint] : [];
  if (nameMissing) notes.push(nameMissing.message);
  // A choice the lists could not answer (the quartile of a journal with no SJR value): say so, or
  // "everything matches" would hide an empty field the owner may need to fill.
  for (const f of m.fields) {
    if (f.type === 'select' && f.autofill?.locked && !f.autofill.alwaysLocked && !fill[f.key]) {
      notes.push(`${f.label} was not found automatically. Choose it yourself if it applies — DRIE and IQAC will see that you chose it.`);
    }
  }
  // Evidence on every record (the module's evidence field is required), or only when something is unconfirmed.
  const evidenceAlways = !!m.fields.find((f) => f.key === m.lookup?.evidenceField)?.required;
  if (applied.eligible && m.lookup.autoApprove === 'always' && evidenceAlways) {
    notes.push('Everything matches the published record. Attach the evidence and press "Save and submit": the record is approved straight away.');
  } else if (applied.eligible) {
    notes.push('Everything matches the published record. When you press "Save and submit" the record is approved straight away — no evidence or manual check is needed.');
  } else if (m.lookup.autoApprove === 'always' && evidenceAlways) {
    notes.push(...reasons.filter((r) => !r.includes('added by hand')));
    notes.push('Attach the evidence and submit: the record is approved when you submit. DRIE and IQAC see the points above and may check them against the evidence and return the record.');
  } else if (m.lookup.autoApprove === 'always') {
    const shown = reasons.filter((r) => !r.includes('added by hand'));
    notes.push(...shown);
    if (m.lookup.evidenceField) {
      notes.push(shown.length > 0
        ? 'Because of the point above, attach evidence before submitting. The record is still approved when you submit; DRIE and IQAC may check it against the evidence and return it if something is wrong.'
        : 'Because your name had to be added by hand, attach evidence before submitting. The record is still approved when you submit; DRIE and IQAC may check it against the evidence.');
    } else {
      notes.push('The record is approved when you submit; DRIE and IQAC may check it and return it if something is wrong.');
    }
  } else {
    notes.push(...reasons, 'You can still submit: the verifying office will check it before it counts as approved.');
  }
  return { found: true, source: result.source, authoritative: result.authoritative, fill, locked, notes };
}
