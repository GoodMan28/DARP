import 'server-only';
import { fail } from '@/server/http/respond';
import { ServiceError } from './service';

export function toResponse(e: unknown) {
  if (e instanceof ServiceError) {
    return fail(e.code, { message: e.message, ...(e.fields ? { fields: e.fields } : {}) });
  }
  throw e;   // unknown errors bubble to withRoute, which logs them and returns INTERNAL
}
