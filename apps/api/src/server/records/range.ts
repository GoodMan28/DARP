import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { cycles } from '@/server/db/schema';
import type { CycleWindows } from './periods';
import type { CycleBounds } from '@/server/rollups/counters';

/** A span of years, first to last, inclusive. A period is named by its starting year. */
export interface YearRange { from: number; to: number }

export const MIN_YEAR = 1990;
export const MAX_YEAR = 2100;

/** A range from query text, or null when it is missing or not sensible. */
export function parseRange(from: unknown, to: unknown): YearRange | null {
  const f = Number(from);
  const t = Number(to);
  if (!Number.isInteger(f) || !Number.isInteger(t)) return null;
  if (f < MIN_YEAR || t > MAX_YEAR || f > t) return null;
  return { from: f, to: t };
}

/**
 * The last three completed calendar years: the range when nothing is saved. Reports are made for
 * years that have ended (in 2026: 2023 to 2025), as the NAAC sheets ask.
 */
export function fallbackRange(now = new Date()): YearRange {
  const y = now.getUTCFullYear();
  return { from: y - 3, to: y - 1 };
}

/**
 * The saved range marked default, else the last three calendar years. It is only ever a starting
 * point for profiles and reports; no record is hidden by it.
 */
export async function defaultRange(): Promise<YearRange & { id: string; name: string }> {
  const [c] = await db.select().from(cycles).where(eq(cycles.isActive, true)).limit(1);
  if (c) return { id: c.id, name: c.name, from: Number(c.cyStart.slice(0, 4)), to: Number(c.cyEnd.slice(0, 4)) };
  const f = fallbackRange();
  return { id: 'default', name: `Last three years (${f.from}–${f.to})`, ...f };
}

/** The same range as first/last year per year type (labels, counters). */
export function boundsOfRange(r: YearRange): CycleBounds {
  return { CY: [r.from, r.to], FY: [r.from, r.to], AY: [r.from, r.to] };
}

/** The range as the date windows older code reads. */
export function windowsOfRange(r: YearRange, id: string): CycleWindows {
  return {
    id,
    cyStart: `${r.from}-01-01`, cyEnd: `${r.to}-12-31`,
    fyStart: `${r.from}-04-01`, fyEnd: `${r.to + 1}-03-31`,
    ayStart: `${r.from}-07-01`, ayEnd: `${r.to + 1}-06-30`,
  };
}
