import type { ModuleConfig } from '@darp/shared/modules/types';
import { LOOKUP_SOURCE_LABEL, type RecordVerification } from '@darp/shared/contracts';
import {
  isInsideCycle, cycleYears, periodSourceField, yearOfPeriod, type CycleWindows,
} from '@/server/records/periods';
import { resolve } from './resolve';
import { isLookupUnavailable } from './http';
import { namesMatch } from './names';
import { buildCitation } from './citation';
import type { LookupResult } from './types';

/**
 * Anything the automatic check could not confirm, worded for the verifying office and IQAC.
 * Under `autoApprove: 'always'` these do not hold a record back: they are the "points to check"
 * DRIE/IQAC see on the approved record, and the reason evidence becomes compulsory.
 */
const FLAG_REASON: Record<string, string> = {
  retracted: 'The publisher has retracted this work.',
  proceedings: 'This DOI belongs to conference proceedings.',
  'not-indexed': 'The journal was not found in the Scopus list or in any Web of Science list IQAC has loaded.',
  'no-journal-lists': 'The journal lists (Scopus, SJR) were not available, so indexing and quartile could not be checked.',
  'no-issn': 'The publisher has not registered an ISSN for this journal.',
  'not-a-book': 'This DOI is not a book or a book chapter.',
  'parent-book-not-found': 'The book this chapter belongs to could not be found, so its title came from the chapter record.',
};

export interface Applied {
  /** The input with locked fields overwritten and the citation rebuilt. */
  data: Record<string, unknown>;
  /** null for modules without a lookup. `autoApproved` is always false here; the service sets it. */
  verification: RecordVerification | null;
  /** Every automatic check passed: nothing for anyone to check. */
  eligible: boolean;
}

const filled = (v: unknown) => v !== undefined && v !== null && v !== '';

/** System-only fields (e.g. where the quartile came from) are never taken from the browser. */
function clearSystemFields(m: ModuleConfig, data: Record<string, unknown>) {
  for (const f of m.fields) if (f.autofill?.alwaysLocked) data[f.key] = '';
}

export async function applyLookup(
  m: ModuleConfig,
  input: Record<string, unknown>,
  ctx: { ownerName: string; cycle: CycleWindows },
): Promise<Applied> {
  if (!m.lookup) return { data: input, verification: null, eligible: false };

  const data: Record<string, unknown> = { ...input };
  const checkedAt = new Date().toISOString();
  const raw = m.lookup.idFields.map((k) => String(data[k] ?? '').trim()).find(Boolean) ?? '';

  const manual = (reason: string): Applied => {
    clearSystemFields(m, data);
    return {
      data,
      eligible: false,
      verification: { source: null, identifier: raw || null, checkedAt, autoApproved: false, reasons: [reason] },
    };
  };

  if (!raw) return manual(`No ${m.lookup.idLabel} was entered, so every detail was typed by hand.`);

  let r: LookupResult;
  try {
    r = await resolve(m.lookup.kind, raw);
  } catch (e) {
    if (isLookupUnavailable(e)) {
      return manual('The publisher register could not be reached when this was saved, so every detail was typed by hand.');
    }
    throw e;
  }
  if (!r.found) return manual(`This ${m.lookup.idLabel} was not found in the publisher registers, so every detail was typed by hand.`);

  const reasons: string[] = [];

  for (const f of m.fields) {
    if (!f.autofill || f.autofill.from === 'citation') continue;
    const fetched = r.values[f.autofill.from] ?? '';
    if (f.autofill.alwaysLocked) {
      data[f.key] = r.authoritative ? fetched : '';
    } else if (f.autofill.locked && r.authoritative) {
      if (fetched) {
        data[f.key] = f.maxLength ? fetched.slice(0, f.maxLength) : fetched;
      } else if (filled(data[f.key])) {
        // Not in the published record or the journal lists: the owner entered it by hand.
        reasons.push(`${f.label} could not be found automatically and was entered by hand.`);
      }
    } else if (fetched && !filled(data[f.key])) {
      data[f.key] = f.maxLength ? fetched.slice(0, f.maxLength) : fetched;
    }
  }

  const citation = m.fields.find((f) => f.autofill?.from === 'citation');
  if (citation) data[citation.key] = buildCitation(m, data, r).slice(0, citation.maxLength ?? 1200);

  if (!r.authoritative) {
    reasons.push(`The details are suggestions from ${r.source ? LOOKUP_SOURCE_LABEL[r.source] : 'an unofficial source'}, not the publisher's own record.`);
  }
  const typeNote = workTypeNote(m, r);
  if (typeNote) reasons.push(typeNote);
  for (const flag of r.flags) {
    const reason = FLAG_REASON[flag];
    if (reason) reasons.push(reason);
  }
  // Matched against the PUBLISHED author list, never the edited one (decision D3).
  const published = r.people.filter((p) => namesMatch(ctx.ownerName, p));
  if (published.length === 0) {
    reasons.push(`${ctx.ownerName} is not in the author list the publisher registered — the name was added by hand.`);
  } else if (published.every((p) => p.bitAffiliated === false)) {
    reasons.push(`${ctx.ownerName} is listed on the published record with another institution, not BIT Mesra.`);
  }
  // A module that refuses out-of-cycle records says so on submit (outsideCycle); others note it.
  const year = Number(r.values.year ?? '');
  if (!m.lookup.refuseOutsideCycle && Number.isInteger(year) && year > 1900 && !isInsideCycle(m, year, ctx.cycle)) {
    reasons.push(`It was published in ${year}, outside this reporting cycle.`);
  }

  return {
    data,
    eligible: reasons.length === 0 && outsideCycle(m, data, ctx.cycle) === null,
    verification: {
      source: r.source,
      identifier: r.values.doi || raw,
      checkedAt,
      autoApproved: false,
      reasons: [...new Set(reasons)],
    },
  };
}

/**
 * When a work appeared online in one year and in an issue in another, says which year counts — the
 * issue year — so the owner is not surprised that it differs from the date on the publisher's page.
 */
export function yearNote(r: LookupResult): string | null {
  const year = r.values.year ?? '';
  const online = r.values.onlineYear ?? '';
  if (!year || !online || year === online) return null;
  return `It was published online in ${online} and in an issue in ${year}. The issue year, ${year}, is the year that counts.`;
}

/** Crossref types that identify a whole volume (a book, proceedings, a series), not one work in it. */
const WHOLE_VOLUME_TYPES = new Set([
  'book', 'edited-book', 'monograph', 'reference-book', 'proceedings', 'book-set', 'book-series', 'book-track',
]);

/**
 * Explains, in plain words, a fetched work whose type the module does not take. The common mistake
 * is pasting the DOI of a whole proceedings volume or book instead of the paper's own DOI (which is
 * usually the volume's DOI with a number added) — say exactly that.
 */
export function workTypeNote(m: ModuleConfig, r: LookupResult): string | null {
  if (!m.lookup || !r.found || m.lookup.acceptTypes.includes(r.rawType ?? '')) return null;
  const wholeVolumeIsWrong = !m.lookup.acceptTypes.some((t) => WHOLE_VOLUME_TYPES.has(t));
  if (wholeVolumeIsWrong && WHOLE_VOLUME_TYPES.has(r.rawType ?? '')) {
    const doi = r.values.doi ?? '';
    return `This DOI is for a whole book or conference proceedings volume, not for a single paper — that is why there are no authors or journal to fill in. If your paper is in this volume, use your paper's own DOI instead${doi ? ` (it is usually this one with a number added, e.g. ${doi}_6)` : ''}.`;
  }
  return `It is registered as "${r.values.workType || r.rawType || 'unknown'}", not as a ${m.lookup.acceptTypes.join(' / ').replace(/-/g, ' ')}.`;
}

/**
 * For a module that refuses out-of-cycle records (`lookup.refuseOutsideCycle`): the field to blame
 * and a plain message when the record's year is outside the cycle, otherwise null. The year is read
 * from the final values, so it covers fetched and hand-typed years alike.
 */
export function outsideCycle(
  m: ModuleConfig, data: Record<string, unknown>, cycle: CycleWindows,
): { field: string; message: string } | null {
  if (!m.lookup?.refuseOutsideCycle) return null;
  const src = periodSourceField(m);
  const raw = src ? data[src.key] : undefined;
  if (!src || raw === undefined || raw === null || raw === '') return null;
  const year = src.kind === 'year'
    ? Number(String(raw))
    : (Number.isNaN(new Date(String(raw)).getTime()) ? NaN : yearOfPeriod(new Date(String(raw)), m.periodType));
  if (!Number.isInteger(year) || isInsideCycle(m, year, cycle)) return null;
  const { from, to } = cycleYears(m, cycle);
  return {
    field: src.key,
    message: `This was published in ${year}. This reporting cycle covers ${from}–${to}, so it cannot be submitted here.`,
  };
}

/** Splits an author list typed as "A. K. Verma, S. Mahato; P. Ranjan and X" into names. */
function splitAuthors(list: string): string[] {
  return list.split(/[,;]|\band\b|&/i).map((s) => s.trim()).filter(Boolean);
}

/**
 * The owner's name must be in the author list before submitting (`lookup.ownerMustBeIn`).
 * Returns the field to blame and the message, or null when the rule is met or not configured.
 */
export function ownerMissingFromAuthors(
  m: ModuleConfig, data: Record<string, unknown>, ownerName: string,
): { field: string; message: string } | null {
  const key = m.lookup?.ownerMustBeIn;
  if (!key) return null;
  const names = splitAuthors(String(data[key] ?? ''));
  const found = names.some((full) => namesMatch(ownerName, { given: '', family: '', full }));
  return found ? null : {
    field: key,
    message: `Your name (${ownerName}) must be in the author list before you can submit. If it is hidden behind "et al.", add it — and attach evidence.`,
  };
}

/**
 * Evidence is compulsory when anything could not be confirmed (`lookup.evidenceField`), so DRIE
 * and IQAC always have something to check a hand-entered detail against.
 */
export function evidenceMissing(
  m: ModuleConfig, data: Record<string, unknown>, verification: RecordVerification | null,
): { field: string; message: string } | null {
  const key = m.lookup?.evidenceField;
  if (!key || !verification || verification.reasons.length === 0 || filled(data[key])) return null;
  return {
    field: key,
    message: 'Attach evidence: some details could not be confirmed automatically (see the notes above the form).',
  };
}
