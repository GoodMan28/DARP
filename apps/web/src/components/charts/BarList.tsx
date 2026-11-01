import Link from 'next/link';
import { ACCENT, num } from './theme';
import { Empty } from './Empty';

export interface BarRow { label: string; value: number; /** Shown instead of the number: money, "5.2". */ text?: string; href?: string; note?: string }

/**
 * Sorted horizontal bars in plain HTML: label, a thin bar with rounded ends, the number. For designations,
 * journals, funders and the departments side by side. `max` fixes the full width (default: the largest row).
 */
export function BarList({ rows, max, thing = 'figures', color = ACCENT }: { rows: BarRow[]; max?: number; thing?: string; color?: string }) {
  const shown = rows.filter((r) => r.value > 0 || r.text);
  if (shown.length === 0) return <Empty thing={thing} />;
  const top = max ?? Math.max(...shown.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {shown.map((r) => {
        const label = r.href
          ? <Link href={r.href} className="truncate font-medium text-ink hover:text-maroon-700 hover:underline">{r.label}</Link>
          : <span className="truncate font-medium text-ink">{r.label}</span>;
        return (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              {label}
              <span className="shrink-0 font-mono tabular-nums text-ink">{r.text ?? num(r.value)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-ink-100" role="presentation">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.round((r.value / top) * 100))}%`, background: color }} />
            </div>
            {r.note ? <p className="mt-0.5 text-2xs text-ink-muted">{r.note}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
