/*
 * The four modules where an award, fellowship or recognition can be entered. IQAC's formats keep them
 * as four sheets, so a person can enter one thing in two of them; DARP only points it out.
 */

export interface AwardModule { moduleKey: string; nameField: string; dateField: string }

export const AWARD_MODULES: AwardModule[] = [
  { moduleKey: 'awards', nameField: 'awardName', dateField: 'awardDate' },
  { moduleKey: 'riawards', nameField: 'awardName', dateField: 'awardDate' },
  { moduleKey: 'extawards', nameField: 'awardName', dateField: 'awardDate' },
  { moduleKey: 'fellowships', nameField: 'name', dateField: 'awardDate' },
];

export const awardModuleOf = (moduleKey: string): AwardModule | undefined => AWARD_MODULES.find((a) => a.moduleKey === moduleKey);

/** An award's name for comparing: case, accents, punctuation and spacing do not tell two names apart. */
export function normAwardName(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
