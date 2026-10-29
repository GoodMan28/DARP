import { and, count, eq, isNull } from 'drizzle-orm';
import { defaultRange } from './range';
import { db } from '@/server/db';
import { records } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { modulesForRole, groupModules } from '@darp/shared/modules';
import type { SidebarGroup } from '@darp/shared/contracts';
import { scopeFilter } from '@/server/records/scope';

/*
 * The app shell's data — the active cycle and the sidebar — served to every signed-in
 * page by GET /api/me.
 */

export interface ActiveCycleInfo {
  id: string;
  name: string;
  deadlineAt: Date | null;
}

export async function getActiveCycle(): Promise<ActiveCycleInfo> {
  const r = await defaultRange();
  return { id: r.id, name: r.name, deadlineAt: null };
}

/**
 * The sidebar for this user: their modules, grouped, each with the number of
 * records they can see. Counts go through scopeFilter like every other query.
 */
export async function getSidebarGroups(user: SessionUser): Promise<SidebarGroup[]> {
  const mods = modulesForRole(user.role);

  const counts = new Map<string, number>();
  await Promise.all(mods.map(async (m) => {
    const [row] = await db.select({ n: count() }).from(records).where(scopeFilter(user, m));
    counts.set(m.key, row?.n ?? 0);
  }));

  return groupModules(mods).map((g) => ({
    name: g.group,
    items: g.modules.map((m) => ({
      key: m.key,
      name: m.name,
      href: `/m/${m.key}`,
      count: counts.get(m.key) ?? 0,
    })),
  }));
}

/** Records awaiting this user's verification, per module — drives the queue badges. */
export async function getPendingCounts(user: SessionUser, moduleKeys: string[]) {
  const out = new Map<string, number>();
  const mods = modulesForRole(user.role).filter((m) => moduleKeys.includes(m.key));
  await Promise.all(mods.map(async (m) => {
    const [row] = await db.select({ n: count() }).from(records).where(and(
      scopeFilter(user, m),
      eq(records.status, 'submitted'),
      isNull(records.deletedAt),
    ));
    out.set(m.key, row?.n ?? 0);
  }));
  return out;
}
