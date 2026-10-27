/** Indian numbering for money. Values are whole rupees held as digit strings. */
export function formatRupees(value: unknown): string {
  const n = Number(String(value ?? '').replace(/[^\d]/g, ''));
  if (!Number.isFinite(n) || String(value ?? '') === '') return '—';
  return `₹ ${new Intl.NumberFormat('en-IN').format(n)}`;
}

/** DD-MM-YYYY, the Indian convention used across the workbooks. */
export function formatDate(value: unknown): string {
  if (!value) return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

export function formatDateTime(value: unknown): string {
  if (!value) return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Truncate for a dense table cell without cutting mid-word where avoidable. */
export function truncate(value: unknown, max = 70): string {
  const s = String(value ?? '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

export {
  formatAwardValidity,
  VALIDITY_FRACTION_DISPLAY,
  validateAndNormalizeValidity,
  PREDEFINED_VALIDITY_OPTIONS,
  PREDEFINED_VALIDITY_MAP,
  CANONICAL_TO_PREDEFINED,
} from './validity';
import { formatAwardValidity } from './validity';

/** Renders any stored field value for a read-only table cell. */
export function displayValue(value: unknown, type?: string, key?: string): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (type === 'money') return formatRupees(value);
  if (type === 'date') return formatDate(value);
  if (type === 'validity' || key === 'awardValidity' || key === 'validity') {
    return formatAwardValidity(value);
  }
  return String(value);
}

/** "1 module" / "3 modules" — never "1 modules". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  verified: 'Verified',
  approved: 'Approved',
  returned: 'Returned',
};
