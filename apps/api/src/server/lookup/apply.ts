import type { ModuleConfig } from '@darp/shared/modules/types';
import { getModule } from '@darp/shared/modules';
import { LOOKUP_SOURCE_LABEL, type RecordVerification, type FieldProvenance, type Authorship } from '@darp/shared/contracts';
import { resolve } from './resolve';
import { isLookupUnavailable } from './http';
import { ownerNamed } from './names';
import { identityOfName, type OwnerIdentity } from './identity';
import { buildCitation } from './citation';
import { rankingFor, rankingItemOf } from '@/server/journals/ranking';
import type { LookupResult, Person } from './types';

/**
 * Anything the automatic check could not confirm, worded for the verifying office and IQAC.
 * Under `autoApprove: 'always'` these do not hold a record back: they are the "points to check"
 * DRIE/IQAC see on the approved record, and the reason evidence becomes compulsory.
 */
const FLAG_REASON: Record<string, string> = {
  retracted: 'The publisher has retracted this work.',
  'not-a-book': 'This DOI is not a book or a book chapter.',
  'parent-book-not-found': 'The book this chapter belongs to could not be found, so its title came from the chapter record.',
  'inventors-from-applicants': 'The Patent Office Journal lists no inventors for this application; the individual applicants were taken as the inventors.',
  'grant-only': 'Only the grant was found in the Patent Office Journal (the application was published before the issues the portal has read), so the inventors were typed by hand.',
};

/** What the fetched record is called in messages: "the publisher's record", "the Patent Office Journal". */
export const sourceOf = (m: ModuleConfig) => m.lookup?.sourceName ?? "the publisher's record";
/** Who the owner must be among: "author", "inventor". */
export const personOf = (m: ModuleConfig) => m.lookup?.personWord ?? 'author';

/** A flag as a sentence. A flag may carry a value after a colon, which is not part of its name. */
export function reasonForFlag(flag: string): string | null {
  const at = flag.indexOf(':');
  return FLAG_REASON[at < 0 ? flag : flag.slice(0, at)] ?? null;
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

/**
 * A patent's date for the current stage, from its status: filed (Applied), published (Published) or
 * granted (Granted). It dates the record, so it is always worked out, never typed.
 */
export function patentStatusDate(data: Record<string, unknown>): string {
  const pick = { Applied: 'filedDate', Published: 'publishedDate', Granted: 'grantDate' }[text(data.status)];
  return pick ? text(data[pick]) : '';
}

export async function applyLookup(
  m: ModuleConfig,
  input: Record<string, unknown>,
  ctx: { owner: OwnerIdentity },
): Promise<Applied> {
  const applied = await applyLookupCore(m, input, ctx);
  if (m.lookup?.kind === 'patent') applied.data.statusDate = patentStatusDate(applied.data);
  // A quartile or Impact Factor the owner typed over the journal lists is a point to check, never a block.
  const typedRanking = await typedRankingReasons(m, applied.data);
  if (typedRanking.length && applied.verification) {
    applied.verification.reasons = [...new Set([...applied.verification.reasons, ...typedRanking])];
    applied.eligible = false;
  }
  return applied;
}

const RANKING_FIELDS = [
  ['manualSjrQuartile', 'Quartile (SJR)', 'sjrQuartile'],
  ['manualJifQuartile', 'JIF quartile', 'jifQuartile'],
  ['manualJif', 'Impact Factor', 'jif'],
] as const;

/** Where a typed ranking differs from what the journal lists say, worded for DRIE and IQAC. */
async function typedRankingReasons(m: ModuleConfig, data: Record<string, unknown>): Promise<string[]> {
  const typed = RANKING_FIELDS.filter(([key]) => m.fields.some((f) => f.key === key) && text(data[key]).trim() !== '');
  if (typed.length === 0) return [];
  const item = rankingItemOf('0', data);
  const lists = await rankingFor(item.issns, item.year, item.journal ?? '');
  return typed.flatMap(([key, label, prop]) => {
    const mine = text(data[key]).trim().toUpperCase();
    const theirs = lists[prop] ?? 'NA';
    if (mine === String(theirs).toUpperCase()) return [];
    return theirs === 'NA'
      ? [`The author typed ${label} ${mine}; the journal lists do not have it.`]
      : [`The author typed ${label} ${mine}; the journal lists say ${theirs}.`];
  });
}

async function applyLookupCore(
  m: ModuleConfig,
  input: Record<string, unknown>,
  ctx: { owner: OwnerIdentity },
): Promise<Applied> {
  if (!m.lookup) return { data: input, verification: null, eligible: false, misplaced: null };

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
      verification: {
        source: null, identifier: raw || null, checkedAt, autoApproved: false, reasons: [reason], fields,
        authorship: { level: 'unmatched', detail: `Nothing was fetched, so the ${personOf(m)} list was typed by hand.` },
      },
    };
  };

  if (!raw) return manual(`No ${m.lookup.idLabel} was entered, so every detail was typed by hand.`);
  const source = sourceOf(m);

  let r: LookupResult;
  try {
    r = await resolve(m.lookup.kind, raw);
  } catch (e) {
    if (isLookupUnavailable(e)) {
      return manual('The publisher register could not be reached when this was saved, so every detail was typed by hand.');
    }
    throw e;
  }
  if (!r.found) {
    return manual(`This ${m.lookup.idLabel} was not found in ${m.lookup.sourceName ?? 'the publisher registers'}, so every detail was typed by hand.`);
  }

  const reasons: string[] = [];
  const fields: Record<string, FieldProvenance> = {};

  // Compare what was saved with what the publisher registered. A blank is filled from the
  // publisher; a different value is the owner's, kept and recorded with the publisher's value.
  for (const f of ownerFields(m, idKey)) {
    const fetched = (r.values[f.autofill!.from] ?? '').slice(0, f.maxLength ?? undefined);
    const typed = text(data[f.key]);
    if (!r.authoritative) {
      // Suggestions (Open Library), not the publisher's record: they only fill blanks.
      if (fetched && !typed) data[f.key] = fetched;
      continue;
    }
    if (fetched && (!typed || same(typed, fetched))) {
      data[f.key] = fetched;
    } else if (fetched) {
      fields[f.key] = { origin: 'changed', fetched };
      reasons.push(`${f.label} was changed by the faculty member: ${source} says "${clip(fetched)}", the record says "${clip(typed)}".`);
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

  // A patent found by its grant number is saved under its application number, so one patent is one record.
  if (m.lookup.kind === 'patent' && idKey && r.authoritative && r.values.applicationNo) data[idKey] = r.values.applicationNo;

  const citation = m.fields.find((f) => f.autofill?.from === 'citation');
  if (citation) data[citation.key] = buildCitation(m, data, r).slice(0, citation.maxLength ?? 1200);

  if (!r.authoritative) {
    reasons.push(`The details are suggestions from ${r.source ? LOOKUP_SOURCE_LABEL[r.source] : 'an unofficial source'}, not the publisher's own record.`);
  }
  const misplaced = misplacedWork(m, r);
  const typeNote = misplaced ? null : workTypeNote(m, r);
  if (typeNote) reasons.push(typeNote);
  for (const flag of r.flags) {
    const reason = reasonForFlag(flag);
    if (reason) reasons.push(reason);
  }
  // Matched against the PUBLISHED author list, never the edited one (decision D3).
  // A grant found without its application has no inventor list at all: its flag's reason says so.
  const ownerName = ctx.owner.name;
  const authorship = authorshipOf(m, r, ctx.owner);
  const published = r.people.filter((p) => ownerNamed(ctx.owner, p));
  if (authorship.level === 'confirmed') {
    // The ORCID iD settles it, whatever the name looks like on the paper.
  } else if (published.length === 0 && !r.flags.includes('grant-only')) {
    reasons.push(`${ownerName} is not in the ${personOf(m)} list of ${source} — the name was added by hand.`);
  } else if (published.length > 0 && published.every((p) => p.bitAffiliated === false)) {
    reasons.push(`${ownerName} is listed on the published record with another institution, not BIT Mesra.`);
  }
  if (ctx.owner.orcid && published.length > 0 && published.every((p) => p.orcid && p.orcid !== ctx.owner.orcid)) {
    reasons.push(`The ${personOf(m)} named like ${ownerName} has a different ORCID iD on the published record (${published[0]!.orcid}), not ${ctx.owner.orcid}: possibly a namesake.`);
  }
  // The year is never a reason: a record keeps its own year, and IQAC chooses the years to pull.
  return {
    data,
    eligible: reasons.length === 0 && !misplaced,
    misplaced,
    verification: {
      source: r.source,
      identifier: r.values.doi || raw,
      checkedAt,
      autoApproved: false,
      reasons: [...new Set(reasons)],
      fields,
      authorship,
    },
  };
}

/**
 * How sure the portal is that the owner is one of the published authors or inventors:
 * their checked ORCID iD on the record; else their name at BIT Mesra; else their name alone; else nothing.
 */
export function authorshipOf(m: ModuleConfig, r: LookupResult, owner: OwnerIdentity): Authorship {
  const word = personOf(m);
  if (owner.orcid && r.people.some((p) => p.orcid === owner.orcid)) {
    return { level: 'confirmed', detail: `${owner.name}'s ORCID iD ${owner.orcid} is on the published record.` };
  }
  const named: Person[] = r.people.filter((p) => ownerNamed(owner, p));
  // A listed author with someone else's ORCID iD is not the owner, however alike the names.
  const plausible = owner.orcid ? named.filter((p) => !p.orcid || p.orcid === owner.orcid) : named;
  if (plausible.some((p) => p.bitAffiliated === true)) {
    return { level: 'likely', detail: `A listed ${word} has ${owner.name}'s name and ${m.lookup?.kind === 'patent' ? 'a BIT Mesra address' : 'BIT Mesra as affiliation'}.` };
  }
  if (plausible.length > 0) {
    const where = plausible.every((p) => p.bitAffiliated === false) ? 'another institution' : 'no affiliation given';
    return { level: 'name', detail: `A listed ${word} has ${owner.name}'s name (${where}). Check the evidence.` };
  }
  return { level: 'unmatched', detail: `No listed ${word} has ${owner.name}'s name: it was added by hand. Check the evidence.` };
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
  // A short list of accepted types is worth naming; the nine of Books, Chapters & Conference Papers are not.
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

/** Splits an author list typed as "A. K. Verma, S. Mahato; P. Ranjan and X" into names. */
function splitAuthors(list: string): string[] {
  return list.split(/[,;]|\band\b|&/i).map((s) => s.trim()).filter(Boolean);
}

/**
 * The owner's name must be in the author list before submitting (`lookup.ownerMustBeIn`).
 * Returns the field to blame and the message, or null when the rule is met or not configured.
 */
export function ownerMissingFromAuthors(
  m: ModuleConfig, data: Record<string, unknown>, ownerIn: OwnerIdentity | string,
): { field: string; message: string } | null {
  const key = m.lookup?.ownerMustBeIn;
  if (!key) return null;
  const owner = typeof ownerIn === 'string' ? identityOfName(ownerIn) : ownerIn;
  const ownerName = owner.name;
  const names = splitAuthors(String(data[key] ?? ''));
  const found = names.some((full) => ownerNamed(owner, { given: '', family: '', full }));
  const word = personOf(m);
  return found ? null : {
    field: key,
    message: `Your name (${ownerName}) must be in the ${word} list before you can submit. ${word === 'author' ? 'If it is hidden behind "et al.", add it' : 'If it is missing, add it'} — and attach evidence.`,
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
