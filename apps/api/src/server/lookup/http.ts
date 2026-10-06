import { log } from '@/server/log';

export const MAILTO = process.env.LOOKUP_MAILTO || 'iqac@bitmesra.ac.in';
const TIMEOUT_MS = Number(process.env.LOOKUP_TIMEOUT_MS ?? 8000);
const USER_AGENT = `DARP/1.0 (BIT Mesra accreditation portal; mailto:${MAILTO})`;

/** The register could not be reached. Callers fall back to manual entry; it is never a crash. */
export class LookupUnavailable extends Error {}

/**
 * GET a JSON document. Returns null on 404. Retries once on a network error, 429 or 5xx,
 * waiting at most 3 seconds. Never logs the full URL (it may carry a key).
 */
export async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown | null> {
  if (process.env.LOOKUP_OFFLINE === '1') throw new LookupUnavailable('lookups are switched off');
  const host = new URL(url).host;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'follow',
      });
    } catch (e) {
      log.warn('lookup network error', { host, attempt, error: String(e) });
      if (attempt === 0) continue;
      throw new LookupUnavailable(`network error at ${host}`);
    }
    if (res.status === 404) return null;
    if (res.ok) return (await res.json()) as unknown;
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      const seconds = Math.min(Number(res.headers.get('retry-after') ?? '1') || 1, 3);
      await new Promise((r) => setTimeout(r, seconds * 1000));
      continue;
    }
    log.warn('lookup refused', { host, status: res.status });
    throw new LookupUnavailable(`HTTP ${res.status} from ${host}`);
  }
  throw new LookupUnavailable(`gave up on ${host}`);
}
