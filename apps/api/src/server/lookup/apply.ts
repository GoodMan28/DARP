import type { ModuleConfig } from '@darp/shared/modules/types';
import { getModule } from '@darp/shared/modules';
import { LOOKUP_SOURCE_LABEL, type RecordVerification, type FieldProvenance } from '@darp/shared/contracts';
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
  'not-indexed': 'The journal was not found in the Scopus list or in any Web of Science list IQAC has loaded.',
  'no-journal-lists': 'The journal lists (Scopus, SJR) were not available, so indexing and quartile could not be checked.',
  'no-issn': 'The publisher has not registered an ISSN for this journal.',
  'not-a-book': 'This DOI is not a book or a book chapter.',
  'parent-book-not-found': 'The book this chapter belongs to could not be found, so its title came from the chapter record.',
};

/** A flag as a sentence. Some flags carry a value after a colon, e.g. "scopus-dropped:2023". */
export function reasonForFlag(flag: string, year: string): string | null {
  const at = flag.indexOf(':');
  const name = at < 0 ? flag : flag.slice(0, at);
  const arg = at < 0 ? '' : flag.slice(at + 1);
  const paper = year ? `a ${year} paper` : 'this paper';
  if (name === 'scopus-dropped') {
    return `Scopus covered this journal only until ${arg}, so ${paper} is not Scopus-indexed.`;
  }
  if (name === 'scopus-not-that-year') {
    return `Scopus covers this journal for ${arg}, so ${paper} is not Scopus-indexed.`;
  }
  return FLAG_REASON[name] ?? null;
}

export interface Applied {
  /** The input with system fields set, blanks filled from the publisher and the citation rebuilt. */
  data: Record<string, unknown>;
  /** null for modules without a lookup. `autoApproved` is always false here; the service sets it. */
  verification: RecordVerification | null;
  /** Every automatic check passed: nothing for anyone to check. */
  eligible: boolean;
  /** The work belongs in another module and cannot be submitted in this one. */
  misplaced: Misplaced | null;
  /**
   * The publisher's values by field key (what the register said, before any change). The cycle
   * check reads the year from here, so changing the year cannot bring a paper into the cycle.
   */
  fetched: Record<string, string>;
}

const filled = (v: unknown) => v !== undefined && v !== null && v !== '';
const text = (v: unknown) => (v === undefined || v === null ? '' : String(v));
/** Equal for this purpose: the same text, ignoring case, spacing and punctuation spacing. */
const same = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, ' ').trim() === b.toLowerCase().replace(/\s+/g, ' ').trim();

/** A long value (an author list) shortened for a sentence. */
const clip = (s: string) => (s.length > 120 ? `${s.slice(0, 117)}…` : s);

/** System-only fields (e.g. where the quartile came from) are never taken from the browser. */
function clearSystemFields(m: ModuleConfig, data: Record<string, unknown>) {
  for (const f of m.fields) if (f.autofill?.alwaysLocked) data[f.key] = '';
}

/** Fields the owner may change or type: filled from the register, but not by the system or the citation builder. */
const ownerFields = (m: ModuleConfig, except: string | null) => m.fields.filter((f) => (
  f.autofill && !f.autofill.alwaysLocked && f.autofill.from !== 'citation' && f.key !== except
));

export async function applyLookup(
  m: ModuleConfig,
  input: Record<string, unknown>,
  ctx: { ownerName: string; cycle: CycleWindows },
): Promise<Applied> {
  if (!m.lookup) return { data: input, verification: null, eligible: false, misplaced: null, fetched: {} };

  const data: Record<string, unknown> = { ...input };
  const checkedAt = new Date().toISOString();
  const idKey = m.lookup.idFields.find((k) => text(data[k]).trim() !== '') ?? null;
  const raw = idKey ? text(data[idKey]).trim() : '';

  const manual = (reason: string): Applied => {
    clearSystemFields(m, data);
    // Nothing was fetched: every detail the owner filled in was typed by hand.
    const fields: Record<string, FieldProvenance> = {};
    for (const f of ownerFields(m, idKey)) if (filled(data[f.key])) fields[f.key] = { origin: 'typed', fetched: '' };
    return {
      data,
      eligible: false,
      misplaced: null,
      fetched: {},
      verification: {
        source: null, identifier: raw || null, checkedAt, autoApproved: false, reasons: [reason], fields,
      },
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
  const fields: Record<string, FieldProvenance> = {};
  const fetchedByKey: Record<string, string> = {};

  // Compare what was saved with what the publisher registered. A blank is filled from the
  // publisher; a different value is the owner's, kept and recorded with the publisher's value.
  for (const f of ownerFields(m, idKey)) {
    const fetched = (r.values[f.autofill!.from] ?? '').slice(0, f.maxLength ?? undefined);
    const typed = text(data[f.key]);
    if (fetched) fetchedByKey[f.key] = fetched;
    if (!r.authoritative) {
      // Suggestions (Open Library), not the publisher's record: they only fill blanks.
      if (fetched && !typed) data[f.key] = fetched;
      continue;
    }
    if (fetched && (!typed || same(typed, fetched))) {
      data[f.key] = fetched;
    } else if (fetched) {
      fields[f.key] = { origin: 'changed', fetched };
      reasons.push(`${f.label} was changed by the faculty member: the publisher's record says "${clip(fetched)}", the record says "${clip(typed)}".`);
    } else if (typed) {
      fields[f.key] = { origin: 'typed', fetched: '' };
      reasons.push(`${f.label} could not be found automatically and was entered by hand.`);
    }
  }

  // System fields come from the register only. One that says where another field came from
  // (the quartile's source) says instead that the owner chose or changed that field.
  for (const f of m.fields) {
    if (!f.autofill?.alwaysLocked) continue;
    const fetched = r.authoritative ? (r.values[f.autofill.from] ?? '') : '';
    const described = f.autofill.describes ? fields[f.autofill.describes] : undefined;
    data[f.key] = !described
      ? fetched
      : described.origin === 'typed'
        ? 'Chosen by the faculty member'
        : `Changed by the faculty member; ${fetched || 'the lists'} gave ${described.fetched}`;
    data[f.key] = text(data[f.key]).slice(0, f.maxLength ?? undefined);
  }

  const citation = m.fields.find((f) => f.autofill?.from === 'citation');
  if (citation) data[citation.key] = buildCitation(m, data, r).slice(0, citation.maxLength ?? 1200);

  if (!r.authoritative) {
    reasons.push(`The details are suggestions from ${r.source ? LOOKUP_SOURCE_LABEL[r.source] : 'an unofficial source'}, not the publisher's own record.`);
  }
  const misplaced = misplacedWork(m, r);
  const typeNote = misplaced ? null : workTypeNote(m, r);
  if (typeNote) reasons.push(typeNote);
  for (const flag of r.flags) {
    const reason = reasonForFlag(flag, r.values.year ?? '');
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

  const fetched = r.authoritative ? fetchedByKey : {};
  return {
    data,
    eligible: reasons.length === 0 && !misplaced && outsideCycle(m, data, ctx.cycle, fetched) === null,
    misplaced,
    fetched,
    verification: {
      source: r.source,
      identifier: r.values.doi || raw,
      checkedAt,
      autoApproved: false,
      reasons: [...new Set(reasons)],
      fields,
    },
  };
}

/** A work that belongs in another module (or in none), refused on submit: lookup.elsewhere. */
export interface Misplaced {
  /** The identifier field, to show the error against. */
  field: string;
  message: string;
  /** The module to enter it in instead, or null when it cannot be entered anywhere (a preprint). */
  moveTo: string | null;
}

export function misplacedWork(m: ModuleConfig, r: LookupResult): Misplaced | null {
  if (!m.lookup?.elsewhere || !r.found || !r.authoritative) return null;
  const rule = m.lookup.elsewhere.find((e) => e.types.includes(r.rawType ?? ''));
  if (!rule) return null;
  const field = m.lookup.idFields[0] ?? 'doi';
  const what = (r.values.workType || r.rawType || 'work').toLowerCase();
  if (!rule.moduleKey) {
    return {
      field, moveTo: null,
      message: `This DOI is a ${what}: it has not been through peer review, so it cannot be entered. Enter the work once a journal or conference has published it.`,
    };
  }
  const target = getModule(rule.moduleKey)?.name ?? rule.moduleKey;
  // A short list of accepted types is worth naming; Books & Chapters' nine are not.
  const accepted = m.lookup.acceptTypes.length <= 2 ? m.lookup.acceptTypes.map((t) => t.replace(/-/g, ' ')).join(' or ') : '';
  // The usual mistake with a whole volume is pasting the volume's DOI instead of the paper's own.
  const volume = WHOLE_VOLUME_TYPES.has(r.rawType ?? '') ? `${workTypeNote(m, r) ?? ''} ` : '';
  return {
    field, moveTo: rule.moduleKey,
    message: `${volume}This DOI is a ${what}${accepted ? `, not a ${accepted},` : ','} so it cannot be submitted here. ${volume ? 'If it is a book you wrote or edited, add' : 'Add'} it under ${target} instead.`,
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
export const WHOLE_VOLUME_TYPES = new Set([
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
  m: ModuleConfig, data: Record<string, unknown>, cycle: CycleWindows, fetched: Record<string, string> = {},
): { field: string; message: string } | null {
  if (!m.lookup?.refuseOutsideCycle) return null;
  const src = periodSourceField(m);
  if (!src) return null;
  // The publisher's year decides, when there is one: changing the year cannot move a paper into the cycle.
  const fromPublisher = fetched[src.key] ?? '';
  const raw = fromPublisher || data[src.key];
  if (raw === undefined || raw === null || raw === '') return null;
  const year = src.kind === 'year'
    ? Number(String(raw))
    : (Number.isNaN(new Date(String(raw)).getTime()) ? NaN : yearOfPeriod(new Date(String(raw)), m.periodType));
  if (!Number.isInteger(year) || isInsideCycle(m, year, cycle)) return null;
  const { from, to } = cycleYears(m, cycle);
  const changed = fromPublisher && String(data[src.key] ?? '') !== fromPublisher;
  return {
    field: src.key,
    message: changed
      ? `The publisher's record dates this ${year}. This reporting cycle covers ${from}–${to}, so it cannot be submitted here — changing the year does not change that.`
      : `This was published in ${year}. This reporting cycle covers ${from}–${to}, so it cannot be submitted here.`,
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
