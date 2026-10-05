export type ErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION'
  | 'CONFLICT' | 'RATE_LIMITED' | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA' | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 422,
  CONFLICT: 409, RATE_LIMITED: 429, PAYLOAD_TOO_LARGE: 413, UNSUPPORTED_MEDIA: 415, INTERNAL: 500,
};

/** Messages that are safe to show a user. Never interpolate internal detail into these. */
const SAFE_MESSAGE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have access to this.',
  NOT_FOUND: 'Not found.',
  VALIDATION: 'Some fields need attention.',
  CONFLICT: 'This conflicts with an existing record.',
  RATE_LIMITED: 'Too many attempts. Please wait and try again.',
  PAYLOAD_TOO_LARGE: 'That file is too large.',
  UNSUPPORTED_MEDIA: 'That file type is not allowed.',
  INTERNAL: 'Something went wrong. The issue has been logged.',
};

/**
 * What a route handler returns. Handlers describe the response instead of writing to
 * Express's `res` themselves, so `withRoute()` stays the only place a response is sent —
 * and a handler cannot forget the envelope or write twice.
 */
export type RouteResult =
  | { kind: 'json'; status: number; body: unknown }
  | { kind: 'file'; status: number; bytes: Uint8Array; headers: Record<string, string> };

export function ok<T>(data: T): RouteResult {
  return { kind: 'json', status: 200, body: { ok: true, data } };
}

export function fail(
  code: ErrorCode,
  opts?: { message?: string; fields?: Record<string, string> },
): RouteResult {
  return {
    kind: 'json',
    status: STATUS[code],
    body: {
      ok: false,
      error: {
        code,
        message: opts?.message ?? SAFE_MESSAGE[code],
        ...(opts?.fields ? { fields: opts.fields } : {}),
      },
    },
  };
}

/** A binary download (evidence files, workbook exports). The caller sets every header. */
export function file(bytes: Uint8Array, headers: Record<string, string>): RouteResult {
  return {
    kind: 'file',
    status: 200,
    bytes,
    headers: { ...headers, 'content-length': String(bytes.length) },
  };
}
