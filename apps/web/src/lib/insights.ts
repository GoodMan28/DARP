import type { Insights } from '@darp/shared/contracts';

/** The chosen years from a page's address: both or neither, four digits each, the first not after the last. */
export function rangeFrom(sp: { from?: string; to?: string }): { from: number; to: number } | null {
  const ok = (v?: string) => (v && /^(19|20)\d{2}$/.test(v) ? Number(v) : null);
  const from = ok(sp.from); const to = ok(sp.to);
  return from !== null && to !== null && from <= to ? { from, to } : null;
}

/** `?from=2022&to=2024`, or nothing: for the address of an insights call. */
export const rangeQuery = (r: { from: number; to: number } | null): string => (r ? `?from=${r.from}&to=${r.to}` : '');

/** The years the range picker offers: back to the oldest year with work (or ten years), up to this year. */
export function yearBounds(byYear: Insights['byYear'], range: { from: number; to: number } | null): { minYear: number; maxYear: number } {
  const now = new Date().getFullYear();
  const oldest = Math.min(byYear[0]?.year ?? now, range?.from ?? now, now - 10);
  return { minYear: Math.max(1990, oldest), maxYear: Math.max(now, range?.to ?? now) };
}
