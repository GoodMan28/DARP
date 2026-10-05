import 'server-only';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { ApiResult, MePayload } from '@darp/shared/contracts';

/**
 * The API's base URL as this server reaches it — a private address, never shown to the
 * browser. Read at request time, not build time, so one build runs in every environment.
 */
export function apiBaseUrl(): string {
  const url = process.env.API_URL;
  if (!url) throw new Error('API_URL is not set — the web tier cannot reach the API');
  return url.replace(/\/+$/, '');
}

/** Request headers a server-rendered page passes on, so the API sees the real visitor. */
const FORWARDED = ['cookie', 'user-agent', 'x-forwarded-for', 'accept-language'] as const;

/**
 * GET from the API as the visitor whose page is being rendered. Their session cookie is
 * forwarded, so the API applies exactly the same authorisation and scope as it would to
 * the browser itself — a page can never see more than its visitor could.
 */
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  const incoming = await headers();
  const forward: Record<string, string> = { accept: 'application/json' };
  for (const name of FORWARDED) {
    const value = incoming.get(name);
    if (value) forward[name] = value;
  }

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, { headers: forward, cache: 'no-store' });
  } catch {
    return { ok: false, error: { code: 'UNAVAILABLE', message: 'The data service could not be reached.' } };
  }
  try {
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: 'INTERNAL', message: 'The data service sent an unreadable response.' } };
  }
}

/**
 * Every signed-in page starts here. Redirects rather than throwing, so an expired
 * session lands on the login page instead of an error screen.
 */
export async function requireMe(opts: { allowPendingPasswordChange?: boolean } = {}): Promise<MePayload> {
  const r = await apiGet<MePayload>('/api/me');
  if (!r.ok) {
    if (r.error.code === 'UNAUTHENTICATED') redirect('/login');
    throw new Error(`GET /api/me failed: ${r.error.code}`);
  }
  if (r.data.user.mustChangePassword && !opts.allowPendingPasswordChange) redirect('/change-password');
  return r.data;
}

export type PageData<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * Loads one piece of a page's data and maps the API's answer onto what a page does:
 *   - not signed in (session expired mid-visit) → back to sign-in
 *   - forbidden or missing                       → the 404 page, so nothing is confirmed to exist
 *   - a business rule refused it                 → `{ ok: false, message }` for the page to explain
 *   - anything else                              → thrown, so Next shows its error page
 */
export async function loadPageData<T>(path: string): Promise<PageData<T>> {
  const r = await apiGet<T>(path);
  if (r.ok) return r;
  const { code, message } = r.error;
  if (code === 'UNAUTHENTICATED') redirect('/login');
  if (code === 'FORBIDDEN' || code === 'NOT_FOUND') notFound();
  if (code === 'VALIDATION' || code === 'CONFLICT') return { ok: false, message };
  throw new Error(`GET ${path.split('?')[0]} failed: ${code}`);
}
