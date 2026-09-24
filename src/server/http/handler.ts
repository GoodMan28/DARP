import 'server-only';
import { headers } from 'next/headers';
import { z } from 'zod';
import { ok, fail } from './respond';
import { getSessionUser, type SessionUser } from '@/server/auth/session';
import { assertCsrf, assertSameOrigin } from '@/server/auth/csrf';
import { rateLimit } from '@/server/auth/rateLimit';
import { hasCapability, type Capability } from '@/server/auth/permissions';
import { log } from '@/server/log';
import type { Role } from '@/modules/_types';

export interface RouteContext<B> {
  actor: SessionUser;
  body: B;
  params: Record<string, string>;
  ip: string;
  userAgent: string;
  /** The original request — routes read query parameters from `new URL(req.url).searchParams`. */
  req: Request;
}

interface Options<S extends z.ZodTypeAny | undefined> {
  /** false only for /api/auth/login, /forgot, /reset and /api/health. */
  auth?: boolean;
  roles?: Role[];
  capability?: Capability;
  /** Zod schema for the JSON body. Omit for GET. */
  schema?: S;
  /** Requests per window for this route, per user (or per IP when unauthenticated). */
  rate?: { limit: number; windowSeconds: number };
  /** Set false for multipart uploads, which parse the body themselves. */
  json?: boolean;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  // Behind nginx we trust X-Forwarded-For's FIRST entry; see 10-deployment-ops.md for the proxy config.
  const xff = h.get('x-forwarded-for');
  return (xff?.split(',')[0] ?? h.get('x-real-ip') ?? '0.0.0.0').trim();
}

type Handler<B> = (ctx: RouteContext<B>) => Promise<Response>;

/**
 * Next 15 type-checks route handlers against this exact shape, so the context
 * parameter cannot be optional here. A route with no dynamic segment is still
 * called with one argument at runtime, hence the defensive read below.
 */
type NextRouteArgs = { params: Promise<Record<string, string>> };

export function withRoute<S extends z.ZodTypeAny | undefined = undefined>(
  opts: Options<S>,
  handler: Handler<S extends z.ZodTypeAny ? z.infer<S> : undefined>,
) {
  return async (req: Request, ctx: NextRouteArgs): Promise<Response> => {
    const started = Date.now();
    let actorId = 'anon';
    try {
      const params = ctx?.params ? await ctx.params : {};
      const ip = await clientIp();
      const h = await headers();
      const userAgent = h.get('user-agent') ?? '';

      /* 1 ── authentication */
      const needAuth = opts.auth !== false;
      const actor = await getSessionUser();
      if (needAuth && !actor) return fail('UNAUTHENTICATED');
      if (actor) actorId = actor.id;

      /* 2 ── forced password change blocks everything except the change itself */
      if (
        actor?.mustChangePassword
        && !req.url.includes('/api/auth/change-password')
        && !req.url.includes('/api/auth/logout')
      ) {
        return fail('FORBIDDEN', { message: 'You must change your password before continuing.' });
      }

      /* 3 ── CSRF (unsafe methods only) */
      // Origin is checked even without a session, so login itself cannot be CSRF'd.
      if (!actor && !(await assertSameOrigin(req.method))) {
        log.warn('cross-origin unauthenticated request rejected', { path: new URL(req.url).pathname });
        return fail('FORBIDDEN', { message: 'Security check failed. Reload the page and try again.' });
      }
      if (actor && !(await assertCsrf(req.method, actor.sessionId))) {
        log.warn('csrf rejected', { userId: actor.id, path: new URL(req.url).pathname });
        return fail('FORBIDDEN', { message: 'Security check failed. Reload the page and try again.' });
      }

      /* 4 ── rate limit */
      if (opts.rate) {
        const key = `${new URL(req.url).pathname}:${actor?.id ?? ip}`;
        const r = rateLimit(key, opts.rate.limit, opts.rate.windowSeconds);
        if (!r.allowed) {
          return fail('RATE_LIMITED', { message: `Too many requests. Try again in ${r.retryAfter}s.` });
        }
      }

      /* 5 ── role and capability */
      if (actor && opts.roles && !opts.roles.includes(actor.role)) return fail('FORBIDDEN');
      if (actor && opts.capability && !hasCapability(actor, opts.capability)) return fail('FORBIDDEN');

      /* 6 ── body validation */
      let body: unknown = undefined;
      if (opts.schema) {
        if (opts.json !== false) {
          const raw = await req.text();
          if (raw.length > 1_000_000) return fail('PAYLOAD_TOO_LARGE');
          try { body = raw ? JSON.parse(raw) : {}; } catch { return fail('VALIDATION', { message: 'Malformed request.' }); }
        }
        const parsed = (opts.schema as z.ZodTypeAny).safeParse(body);
        if (!parsed.success) {
          const fields: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path.join('.') || '_';
            if (!fields[key]) fields[key] = issue.message;
          }
          return fail('VALIDATION', { fields });
        }
        body = parsed.data;
      }

      /* 7 ── run */
      return await handler({
        actor: actor as SessionUser,
        body: body as never,
        params,
        ip,
        userAgent,
        req,
      });
    } catch (err) {
      // Never leak an internal message to the client.
      log.error('route failure', {
        path: new URL(req.url).pathname,
        method: req.method,
        userId: actorId,
        error: err instanceof Error ? err.message : 'unknown',
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
      });
      return fail('INTERNAL');
    } finally {
      const ms = Date.now() - started;
      if (ms > 2000) log.warn('slow route', { path: new URL(req.url).pathname, ms });
    }
  };
}

export { ok, fail };
