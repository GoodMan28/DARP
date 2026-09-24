import 'server-only';
import type { ModuleConfig } from '@/modules/_types';
import {
  encryptPii, decryptPii, isEncrypted,
  maskAadhaar, maskPan, maskEmail, maskPhone, maskText,
} from '@/server/crypto/pii';

/** DOIs arrive in three shapes; store exactly one. */
export function normaliseDoi(value: string): string {
  return value.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').toLowerCase();
}

/**
 * The duplicate guard. Returns null when the module declares no natural key,
 * or when any key part is missing (a draft may legitimately be incomplete).
 *
 * `departmentId` scopes the key for department-owned modules. Without it, one
 * department reporting EDP/MDP revenue for FY 2023-24 would block every other
 * department from reporting the same year — the guard exists to stop the SAME
 * fact being entered twice, and a departmental fact is only duplicated within
 * its own department.
 */
export function buildNaturalKey(
  m: ModuleConfig, data: Record<string, unknown>, departmentId?: string | null,
): string | null {
  if (!m.naturalKey?.length) return null;
  const parts: string[] = [];
  for (const key of m.naturalKey) {
    const field = m.fields.find((f) => f.key === key);
    let v = data[key];
    if (v === undefined || v === null || v === '') return null;
    if (field?.type === 'doi') v = normaliseDoi(String(v));
    parts.push(String(v).trim().toLowerCase().replace(/\s+/g, ' '));
  }
  const prefix = m.scope === 'department' && departmentId ? `${m.key}@${departmentId}` : m.key;
  return `${prefix}:${parts.join('|')}`;
}

/** Searchable text — sensitive and encrypted values are never included. */
export function buildSearchText(m: ModuleConfig, data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const f of m.fields) {
    if (f.sensitive || f.pii === 'encrypted' || f.type === 'file') continue;
    const v = data[f.key];
    if (v === undefined || v === null || v === '') continue;
    parts.push(Array.isArray(v) ? v.join(' ') : String(v));
  }
  return parts.join(' ').toLowerCase().slice(0, 8000);
}

/** Last step before the database: encrypt, normalise, drop anything not in the config. */
export function prepareForStorage(
  m: ModuleConfig, validated: Record<string, unknown>, departmentId?: string | null,
) {
  const data: Record<string, unknown> = {};
  for (const f of m.fields) {
    let v = validated[f.key];
    if (v === undefined) continue;
    if (f.type === 'doi' && typeof v === 'string') v = normaliseDoi(v);
    if (f.type === 'pan' && typeof v === 'string') v = v.toUpperCase();
    if (f.type === 'aadhaar' && typeof v === 'string') v = v.replace(/\D/g, '');
    if (f.pii === 'encrypted' && typeof v === 'string' && v !== '') v = encryptPii(v);
    data[f.key] = v;
  }
  return {
    data,
    naturalKey: buildNaturalKey(m, validated, departmentId),
    searchText: buildSearchText(m, validated),
  };
}

/**
 * Last step before a response leaves the server. Three levels of protection:
 *
 *  - `pii: 'encrypted'` (Aadhaar, PAN) → **always** masked, for everyone, on every route
 *    except the admin reveal route. Plaintext never crosses the network here.
 *  - `pii: 'masked'` (student e-mail, phone, pay package, QS contact details) → the record's
 *    owner and IQAC see the value; any other authorised reader sees a partial form.
 *  - `sensitive` with no `pii` level → dropped entirely for anyone but the owner and IQAC.
 */
export function presentForRead(
  m: ModuleConfig,
  data: Record<string, unknown>,
  opts: { includeSensitive: boolean },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of m.fields) {
    const v = data[f.key];
    if (v === undefined) continue;

    if (f.pii === 'encrypted') {
      const plain = isEncrypted(v) ? safeDecrypt(v) : String(v ?? '');
      out[f.key] = f.type === 'aadhaar' ? maskAadhaar(plain) : f.type === 'pan' ? maskPan(plain) : '••••';
      continue;
    }

    if (f.pii === 'masked' && !opts.includeSensitive) {
      const plain = String(v ?? '');
      out[f.key] = f.type === 'email' ? maskEmail(plain)
        : f.type === 'phone' ? maskPhone(plain)
          : maskText(plain);
      continue;
    }

    if (f.sensitive && !opts.includeSensitive) continue;
    out[f.key] = v;
  }
  return out;
}

/** The editing form needs the stored plaintext for masked fields the owner may change. */
export function presentForEdit(m: ModuleConfig, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of m.fields) {
    const v = data[f.key];
    if (v === undefined) continue;
    // Encrypted values are never sent back to a form: the owner re-types them to change them.
    if (f.pii === 'encrypted') { out[f.key] = ''; continue; }
    out[f.key] = v;
  }
  return out;
}

function safeDecrypt(v: unknown): string {
  try { return decryptPii(String(v)); } catch { return ''; }
}
