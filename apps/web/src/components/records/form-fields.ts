import type { ModuleConfig } from '@darp/shared/modules/types';
import type { CurrentUser, PeriodOption } from '@darp/shared/contracts';

/*
 * The form's field definitions come from GET /api/modules/:moduleKey/schema, which resolves
 * the master-list options IQAC edits at runtime. What is left here is presentation only.
 */

/** The locked attribution strip: never typed, always taken from the account and the record. */
export function lockedStrip(
  m: Pick<ModuleConfig, 'scope'>, user: CurrentUser, periodLabel: string, enteredBy?: string | null,
  /** A saved record: its own department, which is not the viewer's when someone else opens it. */
  record?: { departmentName: string | null },
): { period: string; department: string; enteredBy: string } {
  return {
    period: periodLabel,
    department: m.scope === 'institute'
      ? 'Institute-wide'
      : record
        ? record.departmentName ?? 'No department'
        : user.departmentName ?? 'No department on your account',
    enteredBy: enteredBy?.trim() ? enteredBy : user.name,
  };
}

/** "AY 2022-23 to AY 2024-25" — the window a new record must fall inside. */
export function periodRangeLabel(periods: PeriodOption[]): string {
  const newest = periods[0];
  const oldest = periods[periods.length - 1];
  if (!newest || !oldest) return 'Current cycle';
  if (newest.year === oldest.year) return newest.label;
  return `${oldest.label} to ${newest.label}`;
}
