import { z } from 'zod';
import { withRoute, ok } from '@/server/http/handler';
import { transitionRecord } from '@/server/records/service';
import { toResponse } from '@/server/records/toResponse';

const schema = z.object({
  action: z.enum(['submit', 'verify', 'return', 'approve', 'unlock']),
  remark: z.string().trim().max(1000).optional(),
});

export const POST = withRoute(
  { schema, rate: { limit: 60, windowSeconds: 60 } },
  async ({ actor, params, body }) => {
    try {
      return ok(await transitionRecord(actor, params.moduleKey!, params.id!, body.action, body.remark));
    } catch (e) {
      return toResponse(e);
    }
  },
);
