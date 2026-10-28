import { z } from 'zod';
import { withRoute, ok } from '@/server/http/handler';
import { transitionRecord, acknowledgeCorrection } from '@/server/records/service';
import { toResponse } from '@/server/records/toResponse';

const schema = z.object({
  action: z.enum(['submit', 'return', 'ack']),
  remark: z.string().trim().max(2000).optional(),
});

export const POST = withRoute(
  { schema, rate: { limit: 60, windowSeconds: 60 } },
  async ({ actor, params, body }) => {
    try {
      if (body.action === 'ack') return ok(await acknowledgeCorrection(actor, params.moduleKey!, params.id!));
      return ok(await transitionRecord(actor, params.moduleKey!, params.id!, body.action, body.remark));
    } catch (e) {
      return toResponse(e);
    }
  },
);
