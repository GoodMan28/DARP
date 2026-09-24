import 'server-only';

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

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ ok: true, data }, { status: 200, ...init });
}

export function fail(
  code: ErrorCode,
  opts?: { message?: string; fields?: Record<string, string> },
) {
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message: opts?.message ?? SAFE_MESSAGE[code],
        ...(opts?.fields ? { fields: opts.fields } : {}),
      },
    },
    { status: STATUS[code] },
  );
}
