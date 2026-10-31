import { and, asc, eq, or } from 'drizzle-orm';
import { db } from '@/server/db';
import { savedViews, users } from '@/server/db/schema';
import { cleanView, isPlain, type SavedView, type ViewState } from '@darp/shared/views';
import type { SessionUser } from '@/server/auth/session';
import { canViewModule } from '@/server/auth/permissions';
import { mustGetModule, ServiceError } from './service';
import { viewColumnsFor } from './viewQuery';

const MAX_PER_PERSON = 30;

/** The views the caller may open in a module: their own, and those IQAC shared with everyone. */
export async function listSavedViews(actor: SessionUser, moduleKey: string): Promise<SavedView[]> {
  const m = mustGetModule(moduleKey);
  if (!canViewModule(actor, m)) throw new ServiceError('FORBIDDEN', 'This module is not yours to open.');
  const columns = await viewColumnsFor(m);
  const rows = await db.select({
    id: savedViews.id, name: savedViews.name, shared: savedViews.shared, view: savedViews.view,
    ownerUserId: savedViews.ownerUserId, ownerName: users.name,
  }).from(savedViews).innerJoin(users, eq(users.id, savedViews.ownerUserId))
    .where(and(eq(savedViews.moduleKey, m.key), or(eq(savedViews.ownerUserId, actor.id), eq(savedViews.shared, true))))
    .orderBy(asc(savedViews.shared), asc(savedViews.name));
  return rows.map((r) => ({
    id: r.id, name: r.name, shared: r.shared, ownerName: r.ownerName,
    mine: r.ownerUserId === actor.id || (r.shared && actor.role === 'admin'),
    // Cleaned again against today's columns, so a view saved before a form changed still opens.
    view: cleanView(r.view, columns),
  }));
}

export async function createSavedView(
  actor: SessionUser, moduleKey: string, input: { name: string; view?: unknown; shared: boolean },
): Promise<SavedView> {
  const m = mustGetModule(moduleKey);
  if (!canViewModule(actor, m)) throw new ServiceError('FORBIDDEN', 'This module is not yours to open.');
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 60) throw new ServiceError('VALIDATION', 'Give the view a name of up to 60 characters.', { name: 'Give the view a name.' });
  if (input.shared && actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 'Only IQAC may share a view with everyone.');
  const view: ViewState = cleanView(input.view, await viewColumnsFor(m));
  if (isPlain(view)) throw new ServiceError('VALIDATION', 'There is nothing to save: set a filter, sort, grouping or columns first.');
  const mine = await db.select({ id: savedViews.id }).from(savedViews)
    .where(and(eq(savedViews.moduleKey, m.key), eq(savedViews.ownerUserId, actor.id)));
  if (mine.length >= MAX_PER_PERSON) throw new ServiceError('VALIDATION', `You can keep ${MAX_PER_PERSON} views per module. Delete one first.`);
  const [row] = await db.insert(savedViews).values({
    moduleKey: m.key, ownerUserId: actor.id, name, shared: input.shared, view,
  }).returning({ id: savedViews.id });
  return { id: row!.id, name, shared: input.shared, mine: true, ownerName: actor.name, view };
}

/** Deletes the caller's own view; IQAC may delete a shared one. */
export async function deleteSavedView(actor: SessionUser, moduleKey: string, id: string): Promise<void> {
  const m = mustGetModule(moduleKey);
  const [row] = await db.select({ owner: savedViews.ownerUserId, shared: savedViews.shared }).from(savedViews)
    .where(and(eq(savedViews.id, id), eq(savedViews.moduleKey, m.key))).limit(1);
  if (!row || !(row.owner === actor.id || (row.shared && actor.role === 'admin'))) throw new ServiceError('NOT_FOUND', 'View not found.');
  await db.delete(savedViews).where(eq(savedViews.id, id));
}
