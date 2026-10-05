import type { Request } from 'express';

/**
 * Reads one cookie from the request header. Hand-rolled rather than pulled in as
 * middleware because the API reads exactly two cookies, and a value that is not valid
 * percent-encoding is treated as absent — never as an exception on the request path.
 */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try { return decodeURIComponent(value); } catch { return undefined; }
  }
  return undefined;
}
