/** Categories, in this order, never cycled. Passed the palette check on the white surface. */
export const SERIES = ['#b03a57', '#0052cc', '#00875a', '#5243aa', '#b0630f'] as const;

/** Quartiles are ranked, so one hue from dark to light. */
export const QUARTILE = { q1: '#6b1c31', q2: '#a32b46', q3: '#db6e82', q4: '#f6c8cf', none: '#dfe1e6' } as const;

/** The grid, the axis text and the single accent a one-series chart uses. */
export const GRID = '#ebecf0';
export const AXIS_TEXT = '#5e6c84';
export const ACCENT = SERIES[0];

/** Indian digit grouping: 1,23,456. */
export const num = (v: number): string => v.toLocaleString('en-IN');

/** A short money label for a tight axis: ₹ 12.5 L, ₹ 3.2 Cr. Whole rupees below a lakh. */
export function rupeesShort(v: number): string {
  if (v >= 1e7) return `₹ ${(v / 1e7).toFixed(v >= 1e8 ? 0 : 1).replace(/\.0$/, '')} Cr`;
  if (v >= 1e5) return `₹ ${(v / 1e5).toFixed(v >= 1e6 ? 0 : 1).replace(/\.0$/, '')} L`;
  return `₹ ${num(v)}`;
}

/** Chart animation: once, short, and off when the person asked for less motion. */
export const ANIMATION_MS = 400;
