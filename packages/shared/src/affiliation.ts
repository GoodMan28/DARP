import type { ModuleConfig } from './modules/_types';

/*
 * Whether a piece of work was done as part of BIT, worked out from the date it carries and the day the
 * person joined. It is only a suggestion: the person can change it, and a module whose work carries no
 * date asks. Dates are compared only as far as both are known: a paper dated 2019-03 against a joining
 * date of 2019-03-14 cannot be told apart, so the person is asked.
 */
export function affiliationFrom(joining: string | null | undefined, when: string | null | undefined): 'Yes' | 'No' | null {
  if (!joining || !when || !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(when)) return null;
  const j = joining.slice(0, when.length);
  if (when > j) return 'Yes';
  if (when < j) return 'No';
  return when.length === 10 ? 'Yes' : null;        // the joining day itself counts as at BIT
}

/** The first date the module's record carries, among those that say when the work was done. */
export function firstDate(m: Pick<ModuleConfig, 'affiliation'>, data: Record<string, unknown>): string {
  for (const key of m.affiliation?.dates ?? []) {
    const v = data[key];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

/** True when the person says this work was not done while they were at BIT. Such work is left out of reports and counts. */
export function isOutsideBit(m: Pick<ModuleConfig, 'affiliation'> | undefined, data: Record<string, unknown>): boolean {
  return !!m?.affiliation && data[m.affiliation.field] === 'No';
}
