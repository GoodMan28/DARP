import { withRoute, ok } from '@/server/http/handler';
import { revokeSession, clearSessionCookie } from '@/server/auth/session';
import { audit } from '@/server/audit/log';

export const POST = withRoute({ allowPendingPasswordChange: true }, async ({ actor, ip, userAgent, res }) => {
  await revokeSession(actor.sessionId);
  clearSessionCookie(res);
  await audit({ actor, action: 'auth.logout', entity: 'session', entityId: actor.sessionId, ip, userAgent });
  return ok({ signedOut: true });
});
