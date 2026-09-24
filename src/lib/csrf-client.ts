export function csrfHeader(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const m = document.cookie.match(/(?:^|;\s*)darp_csrf=([^;]+)/);
  return m?.[1] ? { 'x-csrf-token': decodeURIComponent(m[1]) } : {};
}

export interface ApiFailure {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

/** Use this for EVERY mutating fetch from the browser. */
export async function apiFetch(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...csrfHeader(), ...(init.headers ?? {}) },
  });
}

/** apiFetch + JSON parsing into the standard envelope. Never throws on an HTTP error status. */
export async function apiJson<T>(url: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await apiFetch(url, init);
    const parsed = (await res.json()) as ApiResult<T>;
    return parsed;
  } catch {
    return { ok: false, error: { code: 'INTERNAL', message: 'The server could not be reached.' } };
  }
}
