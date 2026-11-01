import type { ModuleConfig } from '@darp/shared/modules/types';
import type { CurrentUser } from '@darp/shared/contracts';

/*
 * The form's field definitions come from GET /api/modules/:moduleKey/schema, which resolves
 * the master-list options IQAC edits at runtime. What is left here is presentation only.
 */

/**
 * The locked attribution strip: never typed, always taken from the account and the record. A new record has
 * no year yet (it is taken from the date filled in, and IQAC picks the years of a report), so `periodLabel` is
 * null there and the strip does not say one.
 */
export function lockedStrip(
  m: Pick<ModuleConfig, 'scope'>, user: CurrentUser, periodLabel: string | null, enteredBy?: string | null,
  /** A saved record: its own department, which is not the viewer's when someone else opens it. */
  record?: { departmentName: string | null },
): { period: string | null; department: string; enteredBy: string } {
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
