import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/', '/instructions', '/login', '/forgot', '/reset'];

/** The API names its session cookie per environment (see the API's auth/constants.ts). */
const SESSION_COOKIES = ['__Host-darp_session', 'darp_session'];

const isProd = process.env.NODE_ENV === 'production';

/**
 * Content-Security-Policy, built per request so production scripts carry a nonce.
 *
 * Next streams its hydration payload in inline <script> tags. Under a bare
 * `script-src 'self'` those are blocked and the page renders blank, so production
 * uses a per-request nonce instead: the nonce is put on the REQUEST headers, which
 * is where Next looks for it when it renders its own script tags.
 *
 * `'strict-dynamic'` lets those nonced scripts load the chunks they need without
 * listing every hashed filename.
 */
function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    isProd
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "connect-src 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const allow = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('Content-Security-Policy', csp);
    return res;
  };

  if (pathname.startsWith('/_next') || pathname === '/favicon.ico' || pathname.startsWith('/brand')) {
    return allow();
  }
  if (PUBLIC.some((p) => pathname === p || (p !== '/' && pathname.startsWith(p + '/')))) {
    return allow();
  }

  // Presence only: whether the session is valid is the API's decision, made on every request.
  const hasSession = SESSION_COOKIES.some((name) => req.cookies.has(name));
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname)}`;
    const res = NextResponse.redirect(url);
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }
  return allow();
}

export const config = {
  // /api/* is excluded: it is forwarded to the API, which authenticates every request itself
  // and sets its own security headers.
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico).*)'],
  // Next.js 15.5 stabilised the Node.js middleware runtime. Pinned explicitly rather than left
  // to default, so this never silently runs on the Edge runtime instead (which lacks some
  // Node globals) on a host — like Vercel — whose default differs from local `next dev`/`start`.
  runtime: 'nodejs',
};
