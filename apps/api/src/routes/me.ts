import { withRoute, ok } from '@/server/http/handler';
import { ROLE_CAPABILITIES } from '@/server/auth/permissions';
import { getActiveCycle, getSidebarGroups } from '@/server/records/navigation';

/**
 * GET /api/me — who is signed in, what their role may do, the active cycle and their
 * sidebar. Every signed-in page renders its shell from this one call.
 *
 * Allowed while a password change is pending so the change-password page can greet the
 * user; the page itself sends them nowhere else until the change is made.
 */
export const GET = withRoute(
  { allowPendingPasswordChange: true, rate: { limit: 240, windowSeconds: 60 } },
  async ({ actor }) => {
    const cycle = await getActiveCycle();
    const groups = actor.mustChangePassword ? [] : await getSidebarGroups(actor, cycle.id);

    // `sessionId` stays on the server: it is the session's database key.
    const { sessionId: _sessionId, ...user } = actor;

    return ok({
      user,
      capabilities: ROLE_CAPABILITIES[actor.role],
      cycle,
      groups,
    });
  },
);
