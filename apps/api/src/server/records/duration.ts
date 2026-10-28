/** "3 years" → 3, "36 months" → 3, "2.5 yrs" → 2.5, "18 months" → 1.5; null when no number can be read. */
export function parseYears(text: unknown): number | null {
  const t = String(text ?? '').toLowerCase().trim();
  const m = /(\d+(?:\.\d+)?)/.exec(t);
  if (!m) return null;
  let n = Number(m[1]);
  if (/month|mon\b|mos\b/.test(t)) n /= 12;
  n = Math.round(n * 2) / 2;                         // halves of a year
  return n >= 0.5 && n <= 30 ? n : null;
}

