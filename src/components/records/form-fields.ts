import 'server-only';
import type { ModuleConfig } from '@/modules/_types';
import type { SessionUser } from '@/server/auth/session';
import { getAllLists } from '@/server/records/masterLists';
import type { FormFieldDef } from '@/components/form/RecordForm';

/**
 * The same field shape `/api/modules/[moduleKey]/schema` returns, built directly from the
 * config so a server-rendered form needs no round trip to its own API. Master-list options
 * are resolved here because IQAC edits those lists at runtime.
 */
export async function toFormFields(m: ModuleConfig): Promise<FormFieldDef[]> {
  const lists = await getAllLists();
  return m.fields.map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: !!f.required,
    help: f.help ?? null,
    placeholder: f.placeholder ?? null,
    options: f.listKey ? (lists[f.listKey] ?? []) : (f.options ?? []),
    showIf: f.showIf ?? null,
    section: f.section ?? null,
    colSpan: f.colSpan ?? 1,
    maxLength: f.maxLength ?? null,
    accept: f.accept ?? null,
    maxSizeMB: f.maxSizeMB ?? null,
    // The browser is told a field is protected, never why or how.
    protected: f.pii === 'encrypted' || !!f.sensitive,
  }));
}

/** The locked attribution strip: never typed, always taken from the account and the record. */
export function lockedStrip(
  m: ModuleConfig, user: SessionUser, periodLabel: string, enteredBy?: string | null,
): { period: string; department: string; enteredBy: string } {
  return {
    period: periodLabel,
    department: m.scope === 'institute'
      ? 'Institute-wide'
      : user.departmentName ?? 'No department on your account',
    enteredBy: enteredBy?.trim() ? enteredBy : user.name,
  };
}

/** "AY 2022-23 to AY 2024-25" — the window a new record must fall inside. */
export function periodRangeLabel(periods: Array<{ year: number; label: string }>): string {
  const newest = periods[0];
  const oldest = periods[periods.length - 1];
  if (!newest || !oldest) return 'Current cycle';
  if (newest.year === oldest.year) return newest.label;
  return `${oldest.label} to ${newest.label}`;
}
