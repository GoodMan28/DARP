import { z } from 'zod';
import { withRoute, ok, fail } from '@/server/http/handler';
import { getEncryptedFieldForReveal } from '@/server/records/service';
import { toResponse } from '@/server/records/toResponse';
import { decryptPii, isEncrypted, maskAadhaar, maskPan } from '@/server/crypto/pii';
import { audit } from '@/server/audit/log';
import { MODULE_KEYS } from '@/modules';

/**
 * The one route in the codebase that returns a decrypted Aadhaar or PAN.
 *
 * `revealPii` is admin-only (see ROLE_CAPABILITIES). A typed reason is required and
 * stored, the `pii.reveal` audit row is written BEFORE the plaintext is produced, and
 * the route is capped at 10 reveals per admin per hour by the wrapper's rate limiter.
 * It is a POST rather than a GET so the reason never lands in a URL or an access log.
 *
 * The record itself is loaded by the service layer, which owns every `records` query
 * and therefore every scope check.
 */
const schema = z.object({
  /** The record's module, needed to resolve the field and to build the scope filter. */
  moduleKey: z.string().refine((k) => MODULE_KEYS.includes(k), 'Unknown module.'),
  reason: z.string().trim().min(10, 'Say why this value is needed, in a full sentence.').max(500),
});

export const POST = withRoute(
  {
    roles: ['admin'],
    capability: 'revealPii',
    schema,
    // Step 3.3 rule 4: ten reveals per admin per hour.
    rate: { limit: 10, windowSeconds: 3600 },
  },
  async ({ actor, body, params, ip, userAgent }) => {
    const idCheck = z.string().uuid().safeParse(params.recordId);
    if (!idCheck.success) return fail('NOT_FOUND');

    try {
      const target = await getEncryptedFieldForReveal(
        actor, body.moduleKey, idCheck.data, String(params.fieldKey ?? ''),
      );
      if (!isEncrypted(target.ciphertext)) return fail('NOT_FOUND');

      // Written BEFORE the value is decrypted or returned, so a reveal is on record
      // even if decryption fails or the response never reaches the browser.
      await audit({
        actor,
        action: 'pii.reveal',
        entity: 'record',
        entityId: target.recordId,
        ip,
        userAgent,
        meta: {
          moduleKey: body.moduleKey,
          fieldKey: target.fieldKey,
          fieldLabel: target.fieldLabel,
          reason: body.reason,
          ownerUserId: target.ownerUserId,
          ownerName: target.ownerName,
        },
      });

      let value: string;
      try {
        value = decryptPii(target.ciphertext);
      } catch {
        // A GCM authentication failure is tampering, not a bad request.
        return fail('INTERNAL');
      }

      const masked = target.fieldType === 'aadhaar' ? maskAadhaar(value)
        : target.fieldType === 'pan' ? maskPan(value)
          : '••••';

      return ok({
        recordId: target.recordId,
        fieldKey: target.fieldKey,
        fieldLabel: target.fieldLabel,
        masked,
        value,
        ownerName: target.ownerName,
        revealedAt: new Date().toISOString(),
      });
    } catch (e) {
      return toResponse(e);
    }
  },
);
