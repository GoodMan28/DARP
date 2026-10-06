import type { ModuleConfig } from '@darp/shared/modules/types';
import { LOOKUP_SOURCE_LABEL, type RecordVerification } from '@darp/shared/contracts';
import { isInsideCycle, type CycleWindows } from '@/server/records/periods';
import { resolve } from './resolve';
import { LookupUnavailable } from './http';
import { namesMatch } from './names';
import { buildCitation } from './citation';
import type { LookupResult } from './types';

/** Flags that stop automatic approval, and how they read to a person. */
const FLAG_REASON: Record<string, string> = {
  retracted: 'The publisher has retracted this work.',
  proceedings: 'This DOI belongs to conference proceedings.',
  'not-indexed': 'The journal is not in the Scopus or Web of Science lists IQAC has loaded.',
  'no-issn': 'The publisher has not registered an ISSN for this journal.',
  'not-a-book': 'This DOI is not a book or a book chapter.',
  'parent-book-not-found': 'The book this chapter belongs to could not be found, so its title came from the chapter record.',
};

export interface Applied {
  /** The input with locked fields overwritten and the citation rebuilt. */
  data: Record<string, unknown>;
  /** null for modules without a lookup. `autoApproved` is always false here; the service sets it. */
  verification: RecordVerification | null;
  /** Every automatic check passed (decision D2). */
  eligible: boolean;
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

  const manual = (reason: string): Applied => ({
    data,
    eligible: false,
    verification: { source: null, identifier: raw || null, checkedAt, autoApproved: false, reasons: [reason] },
  });

  if (!raw) return manual(`No ${m.lookup.idLabel} was entered, so the details were typed by hand.`);

  let r: LookupResult;
  try {
    r = await resolve(m.lookup.kind, raw);
  } catch (e) {
    if (e instanceof LookupUnavailable) {
      return manual('The publisher register could not be reached when this was saved, so the details were typed by hand.');
    }
    throw e;
  }
  if (!r.found) return manual(`This ${m.lookup.idLabel} was not found in the publisher registers, so the details were typed by hand.`);

  const reasons: string[] = [];

  for (const f of m.fields) {
    if (!f.autofill || f.autofill.from === 'citation') continue;
    const fetched = r.values[f.autofill.from] ?? '';
    if (f.autofill.locked && r.authoritative) {
      if (fetched) data[f.key] = f.maxLength ? fetched.slice(0, f.maxLength) : fetched;
      else if (f.required) reasons.push(`${f.label} is not in the published record and was typed by hand.`);
    } else if (fetched && (data[f.key] === undefined || data[f.key] === '')) {
      data[f.key] = f.maxLength ? fetched.slice(0, f.maxLength) : fetched;
    }
  }

  const citation = m.fields.find((f) => f.autofill?.from === 'citation');
  if (citation) data[citation.key] = buildCitation(m, data, r).slice(0, citation.maxLength ?? 1200);

  if (!r.authoritative) {
    reasons.push(`The details are suggestions from ${r.source ? LOOKUP_SOURCE_LABEL[r.source] : 'an unofficial source'}, not the publisher's own record.`);
  }
  if (!m.lookup.acceptTypes.includes(r.rawType ?? '')) {
    reasons.push(`This is registered as "${r.values.workType || r.rawType || 'unknown'}", which this module does not approve automatically.`);
  }
  for (const flag of r.flags) {
    const reason = FLAG_REASON[flag];
    if (reason) reasons.push(reason);
  }
  const ownerListed = r.people.some((p) => namesMatch(ctx.ownerName, p) && p.bitAffiliated !== false);
  if (!ownerListed) {
    reasons.push(`${ctx.ownerName} could not be matched to a person named on the published record with a BIT Mesra affiliation.`);
  }
  const year = Number(r.values.year ?? '');
  if (Number.isInteger(year) && year > 1900 && !isInsideCycle(m, year, ctx.cycle)) {
    reasons.push(`It was published in ${year}, outside this reporting cycle.`);
  }

  return {
    data,
    eligible: m.lookup.autoApprove && reasons.length === 0,
    verification: {
      source: r.source,
      identifier: r.values.doi || raw,
      checkedAt,
      autoApproved: false,
      reasons: [...new Set(reasons)],
    },
  };
}
