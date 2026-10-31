import { Card, CardHeader } from '@/components/ui';
import { formatDate } from '@darp/shared/format';
import type { NameParts } from '@darp/shared/names';

/**
 * A person's name in four parts, with the account facts the Faculty Profile does not ask again.
 * IQAC keeps these: the name is matched against author and inventor lists, so it is not edited here.
 */
export function AccountNameCard({ parts, email, department, dateOfJoining }: {
  parts: NameParts;
  email: string;
  department: string | null;
  dateOfJoining: string | null;
}) {
  const rows: Array<[string, string]> = [
    ['Prefix', parts.prefix || '—'],
    ['First name', parts.first || '—'],
    ['Middle name', parts.middle || '—'],
    ['Last name', parts.last || '—'],
    ['Institute e-mail', email],
    ['Department', department ?? '—'],
    ['Date of joining', dateOfJoining ? formatDate(dateOfJoining) : '—'],
  ];
  return (
    <Card className="mb-4" padded={false}>
      <CardHeader title="Your name" subtitle="IQAC keeps these. Ask IQAC to correct them; they are matched against author and inventor lists, so keep them as you publish." />
      <dl className="grid gap-x-8 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-2xs font-semibold text-ink-muted">{label}</dt>
            <dd className="truncate text-sm text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
