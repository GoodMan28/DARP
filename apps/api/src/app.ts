import express, { type ErrorRequestHandler } from 'express';
import { api } from './routes';
import { fail } from '@/server/http/respond';
import { log } from '@/server/log';

/**
 * How many proxies in front of the API are believed when they report the client's address
 * in X-Forwarded-For. The default trusts only private-network hops — the Next.js tier and
 * a reverse proxy on the same machine or private network — so a client on the internet
 * cannot forge its own IP to dodge the per-IP login throttle. See README → Configuration.
 */
function trustProxy(): string | number | boolean {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw) return 'loopback, linklocal, uniquelocal';
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy());

  // Every API response is data, never a page: nothing may frame it, sniff it or cache it.
  // Routes that send files override the CSP and cache headers with their own.
  app.use((_req, res, next) => {
    res.set({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      'cache-control': 'no-store, no-cache, must-revalidate, private',
      pragma: 'no-cache',
    });
    next();
  });

  app.use('/api', api);

  app.use((_req, res) => {
    const r = fail('NOT_FOUND');
    if (r.kind === 'json') res.status(r.status).json(r.body);
  });

  // withRoute() catches its own errors; this only sees failures outside a route handler.
  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    log.error('unhandled request error', {
      path: req.originalUrl.split('?')[0],
      error: err instanceof Error ? err.message : 'unknown',
    });
    if (res.headersSent) return;
    const r = fail('INTERNAL');
    if (r.kind === 'json') res.status(r.status).json(r.body);
  };
  app.use(onError);

  return app;
}
