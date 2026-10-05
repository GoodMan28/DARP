import type { RequestHandler } from 'express';

/**
 * Liveness only: answers whether the process is up, without touching the database, so a
 * slow query never makes a supervisor restart a healthy server. Deliberately outside
 * `withRoute()` — it needs no session and must stay cheap.
 */
export const GET: RequestHandler = (_req, res) => {
  res.json({ ok: true, data: { status: 'up', time: new Date().toISOString() } });
};
