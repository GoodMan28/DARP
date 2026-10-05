import type { NextRequest } from 'next/server';
import { apiBaseUrl } from '@/lib/api.server';

/**
 * Forwards every browser request under /api/* to the Express API.
 *
 * The browser only ever talks to this origin, so the session cookie, SameSite and the
 * API's same-origin and CSRF checks work exactly as they did when both tiers were one
 * app — and the API itself never needs to be reachable from the internet.
 *
 * Only an allow-list of headers crosses in either direction. Everything else (hop-by-hop
 * headers, the browser's Host, internal headers from the API) stays on its own side.
 */

export const dynamic = 'force-dynamic';

const REQUEST_HEADERS = [
  'accept', 'accept-language', 'content-type', 'cookie', 'origin', 'referer',
  'user-agent', 'x-csrf-token', 'x-forwarded-for', 'x-forwarded-proto',
];

const RESPONSE_HEADERS = [
  'cache-control', 'content-disposition', 'content-length', 'content-security-policy',
  'content-type', 'pragma', 'retry-after',
];

/** Evidence uploads are capped at 5 MB by the API; anything far beyond that is refused here. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function failure(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

/** Reads the request body up to the cap. Null means it was larger. */
async function readBody(req: NextRequest): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { body.set(c, offset); offset += c.byteLength; }
  return body;
}

async function forward(req: NextRequest): Promise<Response> {
  const target = `${apiBaseUrl()}${req.nextUrl.pathname}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  let body: Uint8Array<ArrayBuffer> | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      return failure(413, 'PAYLOAD_TOO_LARGE', 'That file is too large.');
    }
    const read = await readBody(req);
    if (read === null) return failure(413, 'PAYLOAD_TOO_LARGE', 'That file is too large.');
    body = read;
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return failure(502, 'UNAVAILABLE', 'The server could not be reached. Try again in a moment.');
  }

  const out = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  // Sign-in, sign-out and password changes set cookies; each must arrive as its own header.
  for (const cookie of upstream.headers.getSetCookie()) out.append('set-cookie', cookie);
  if (!out.has('cache-control')) out.set('cache-control', 'no-store');

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export {
  forward as GET,
  forward as POST,
  forward as PUT,
  forward as PATCH,
  forward as DELETE,
};
