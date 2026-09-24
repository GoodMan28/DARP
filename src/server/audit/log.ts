import 'server-only';
import { db } from '@/server/db';
import { auditLog } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { isEncrypted } from '@/server/crypto/pii';

export type AuditAction =
  | 'auth.login.success' | 'auth.login.fail' | 'auth.logout' | 'auth.locked'
  | 'auth.password.change' | 'auth.password.reset.request' | 'auth.password.reset.complete'
  | 'record.create' | 'record.update' | 'record.delete' | 'record.transition'
  | 'evidence.upload' | 'evidence.download' | 'evidence.delete'
  | 'pii.reveal' | 'export.generate'
  | 'user.create' | 'user.update' | 'user.deactivate' | 'user.seed'
  | 'masterlist.update' | 'cycle.update' | 'baseline.update' | 'declaration.update';

/** Strips values that must never be written to the audit trail. */
function sanitise(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitise);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (/password|token|secret/i.test(k)) { out[k] = '[redacted]'; continue; }
    if (/aadhaar|aadhar|pan/i.test(k)) { out[k] = isEncrypted(v) ? '[ciphertext]' : '[redacted]'; continue; }
    out[k] = sanitise(v);
  }
  return out;
}

export async function audit(params: {
  actor?: SessionUser | null;
  action: AuditAction;
  entity: 'record' | 'user' | 'evidence' | 'session' | 'export' | 'masterlist' | 'cycle' | 'baseline' | 'declaration';
  entityId?: string | null;
  ip?: string;
  userAgent?: string;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}) {
  await db.insert(auditLog).values({
    actorUserId: params.actor?.id ?? null,
    actorRole: params.actor?.role ?? null,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId ?? null,
    ip: params.ip ?? null,
    userAgent: params.userAgent?.slice(0, 300) ?? null,
    before: params.before ? (sanitise(params.before) as object) : null,
    after: params.after ? (sanitise(params.after) as object) : null,
    meta: params.meta ? (sanitise(params.meta) as object) : null,
  });
}
