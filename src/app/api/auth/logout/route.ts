import { withRoute, ok } from '@/server/http/handler';
import { revokeSession, clearSessionCookie } from '@/server/auth/session';
import { audit } from '@/server/audit/log';

export const POST = withRoute({}, async ({ actor, ip, userAgent }) => {
  await revokeSession(actor.sessionId);
  await clearSessionCookie();
  await audit({ actor, action: 'auth.logout', entity: 'session', entityId: actor.sessionId, ip, userAgent });
  return ok({ signedOut: true });
});
