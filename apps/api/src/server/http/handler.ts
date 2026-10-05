import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { ok, fail, file, type RouteResult } from './respond';
import { getSessionUser, type SessionUser } from '@/server/auth/session';
import { assertCsrf, checkSameOrigin } from '@/server/auth/csrf';
import { rateLimit } from '@/server/auth/rateLimit';
import { hasCapability, type Capability } from '@/server/auth/permissions';
import { log } from '@/server/log';
import type { Role } from '@darp/shared/modules/types';

export interface RouteContext<B> {
  actor: SessionUser;
  body: B;
  params: Record<string, string>;
  query: URLSearchParams;
  ip: string;
  userAgent: string;
  /** For the few routes that need more than the above: multipart uploads, setting cookies. */
  req: Request;
  res: Response;
}

interface Options<S extends z.ZodTypeAny | undefined> {
  /** false only for /api/auth/login, /forgot, /reset and /api/health. */
  auth?: boolean;
  /**
   * An account created with a temporary password may do nothing until it sets its own.
   * Only the routes that make that possible opt out: change-password, logout, and /api/me
   * (so the change-password page can greet the user).
   */
  allowPendingPasswordChange?: boolean;
  roles?: Role[];
  capability?: Capability;
  /** Zod schema for the JSON body. Omit for GET. */
  schema?: S;
  /** Requests per window for this route, per user (or per IP when unauthenticated). */
  rate?: { limit: number; windowSeconds: number };
  /** Set false for multipart uploads, which parse the body themselves. */
  json?: boolean;
}

const MAX_JSON_BYTES = 1_000_000;

/** Reads the raw body up to a cap. Returns null when the body is larger than the cap. */
async function readBody(req: Request, limit: number): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buf.length;
    if (size > limit) return null;
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(res: Response, result: RouteResult): void {
  res.status(result.status);
  if (result.kind === 'file') {
    res.set(result.headers);
    res.end(Buffer.from(result.bytes));
    return;
  }
  res.json(result.body);
}

type Handler<B> = (ctx: RouteContext<B>) => Promise<RouteResult>;

/**
 * Every API route is registered through this wrapper. It runs the same pipeline, in the
 * same order, for every request: authenticate → forced password change → CSRF → rate
 * limit → role and capability → body validation → handler. A route cannot skip a step
 * by forgetting it, and an unexpected error never reaches the client as anything but a
 * generic INTERNAL envelope.
 */
export function withRoute<S extends z.ZodTypeAny | undefined = undefined>(
  opts: Options<S>,
  handler: Handler<S extends z.ZodTypeAny ? z.infer<S> : undefined>,
): RequestHandler {
  return async (req, res) => {
    const started = Date.now();
    const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
    let actorId = 'anon';
    try {
      // `trust proxy` (see app.ts) decides how far back X-Forwarded-For is believed.
      const ip = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
      const userAgent = req.get('user-agent') ?? '';

      /* 1 ── authentication */
      const needAuth = opts.auth !== false;
      const actor = await getSessionUser(req);
      if (needAuth && !actor) return send(res, fail('UNAUTHENTICATED'));
      if (actor) actorId = actor.id;

      /* 2 ── forced password change blocks everything except the change itself */
      if (actor?.mustChangePassword && !opts.allowPendingPasswordChange) {
        return send(res, fail('FORBIDDEN', { message: 'You must change your password before continuing.' }));
      }

      /* 3 ── CSRF (unsafe methods only) */
      // Origin is checked even without a session, so login itself cannot be CSRF'd.
      if (!actor) {
        const check = checkSameOrigin(req);
        if (!check.ok) {
          log.warn('cross-origin unauthenticated request rejected', {
            path,
            origin: check.origin,
            referer: check.referer,
            expected: check.expected,
          });
          return send(res, fail('FORBIDDEN', { message: 'Security check failed. Reload the page and try again.' }));
        }
      }
      if (actor && !assertCsrf(req, actor.sessionId)) {
        log.warn('csrf rejected', { userId: actor.id, path });
        return send(res, fail('FORBIDDEN', { message: 'Security check failed. Reload the page and try again.' }));
      }

      /* 4 ── rate limit */
      if (opts.rate) {
        const key = `${path}:${actor?.id ?? ip}`;
        const r = rateLimit(key, opts.rate.limit, opts.rate.windowSeconds);
        if (!r.allowed) {
          res.set('retry-after', String(r.retryAfter));
          return send(res, fail('RATE_LIMITED', { message: `Too many requests. Try again in ${r.retryAfter}s.` }));
        }
      }

      /* 5 ── role and capability */
      if (actor && opts.roles && !opts.roles.includes(actor.role)) return send(res, fail('FORBIDDEN'));
      if (actor && opts.capability && !hasCapability(actor, opts.capability)) return send(res, fail('FORBIDDEN'));

      /* 6 ── body validation */
      let body: unknown = undefined;
      if (opts.schema) {
        if (opts.json !== false) {
          const raw = await readBody(req, MAX_JSON_BYTES);
          if (raw === null) return send(res, fail('PAYLOAD_TOO_LARGE'));
          try { body = raw ? JSON.parse(raw) : {}; } catch { return send(res, fail('VALIDATION', { message: 'Malformed request.' })); }
        }
        const parsed = (opts.schema as z.ZodTypeAny).safeParse(body);
        if (!parsed.success) {
          const fields: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path.join('.') || '_';
            if (!fields[key]) fields[key] = issue.message;
          }
          return send(res, fail('VALIDATION', { fields }));
        }
        body = parsed.data;
      }

      /* 7 ── run */
      const query = new URLSearchParams(req.originalUrl.split('?')[1] ?? '');
      return send(res, await handler({
        actor: actor as SessionUser,
        body: body as never,
        params: req.params as Record<string, string>,
        query,
        ip,
        userAgent,
        req,
        res,
      }));
    } catch (err) {
      // Never leak an internal message to the client.
      log.error('route failure', {
        path,
        method: req.method,
        userId: actorId,
        error: err instanceof Error ? err.message : 'unknown',
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
      });
      if (!res.headersSent) send(res, fail('INTERNAL'));
    } finally {
      const ms = Date.now() - started;
      if (ms > 2000) log.warn('slow route', { path, ms });
    }
  };
}

export { ok, fail, file };
