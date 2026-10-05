import { z } from 'zod';
import { and, asc, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { db } from '@/server/db';
import { auditLog, users } from '@/server/db/schema';
import { withRoute, ok, fail } from '@/server/http/handler';

/** The `AuditAction` union from `@/server/audit/log`, exposed so the filter has real options. */
const ACTIONS = [
  'auth.login.success', 'auth.login.fail', 'auth.logout', 'auth.locked',
  'auth.password.change', 'auth.password.reset.request', 'auth.password.reset.complete',
  'record.create', 'record.update', 'record.delete', 'record.transition',
  'evidence.upload', 'evidence.download', 'evidence.delete',
  'pii.reveal', 'export.generate',
  'user.create', 'user.update', 'user.deactivate',
  'masterlist.update', 'cycle.update', 'baseline.update',
] as const;

const ENTITIES = ['record', 'user', 'evidence', 'session', 'export', 'masterlist', 'cycle', 'baseline'] as const;

const querySchema = z.object({
  actorUserId: z.string().uuid().optional(),
  action: z.enum(ACTIONS).optional(),
  entity: z.enum(ENTITIES).optional(),
  entityId: z.string().max(200).optional(),
  /** Inclusive calendar dates, interpreted in the server's zone. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
});

/**
 * Read-only. The table is append-only at the database level (trigger plus revoked
 * grants), so there is deliberately no POST, PATCH or DELETE here.
 */
export const GET = withRoute(
  { roles: ['admin'], capability: 'viewAudit', rate: { limit: 60, windowSeconds: 60 } },
  async ({ query: sp }) => {
    const raw: Record<string, string> = {};
    for (const key of ['actorUserId', 'action', 'entity', 'entityId', 'from', 'to', 'page', 'pageSize']) {
      const v = sp.get(key);
      if (v !== null && v !== '') raw[key] = v;
    }

    const parsed = querySchema.safeParse(raw);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[issue.path.join('.') || '_'] = issue.message;
      return fail('VALIDATION', { message: 'Check the filters.', fields });
    }
    const q = parsed.data;

    const conditions: SQL[] = [];
    if (q.actorUserId) conditions.push(eq(auditLog.actorUserId, q.actorUserId));
    if (q.action) conditions.push(eq(auditLog.action, q.action));
    if (q.entity) conditions.push(eq(auditLog.entity, q.entity));
    if (q.entityId) conditions.push(eq(auditLog.entityId, q.entityId));
    if (q.from) conditions.push(gte(auditLog.at, new Date(`${q.from}T00:00:00.000Z`)));
    if (q.to) conditions.push(lte(auditLog.at, new Date(`${q.to}T23:59:59.999Z`)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = where
      ? await db.select({ n: count() }).from(auditLog).where(where)
      : await db.select({ n: count() }).from(auditLog);
    const total = totalRow?.n ?? 0;

    const base = db
      .select({
        id: auditLog.id,
        at: auditLog.at,
        actorUserId: auditLog.actorUserId,
        actorRole: auditLog.actorRole,
        actorName: users.name,
        actorEmail: users.email,
        action: auditLog.action,
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        ip: auditLog.ip,
        before: auditLog.before,
        after: auditLog.after,
        meta: auditLog.meta,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId));

    const rows = await (where ? base.where(where) : base)
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    // The actor list for the filter dropdown: small enough to send whole (~200 accounts).
    const actors = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .orderBy(asc(users.name));

    return ok({
      entries: rows,
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      filters: { actions: ACTIONS, entities: ENTITIES, actors },
    });
  },
);
