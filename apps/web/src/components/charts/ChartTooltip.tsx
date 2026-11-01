'use client';

import type { ReactNode } from 'react';

interface Entry { name?: string | number; value?: number | string; color?: string; payload?: Record<string, unknown> }

/**
 * The one tooltip every chart shares: a white card with a soft shadow, the year or name, then each value
 * in mono type. Recharts passes `active`, `payload` and `label` to the element given as `content`.
 */
export function ChartTooltip({ active, payload, label, format, title }: {
  active?: boolean;
  payload?: Entry[];
  label?: string | number;
  /** How a value reads: money, a plain count… */
  format?: (v: number, name: string) => string;
  title?: (label: string | number | undefined, payload: Entry[]) => ReactNode;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const heading = title ? title(label, payload) : label;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md" role="status">
      {heading !== undefined && heading !== '' ? <p className="mb-1 font-semibold text-ink">{heading}</p> : null}
      <ul className="space-y-0.5">
        {payload.map((p, i) => (
          <li key={`${p.name}-${i}`} className="flex items-center gap-2">
            {p.color ? <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} /> : null}
            <span className="text-ink-muted">{p.name}</span>
            <span className="ml-auto pl-3 font-mono tabular-nums text-ink">
              {typeof p.value === 'number' ? (format ? format(p.value, String(p.name ?? '')) : p.value.toLocaleString('en-IN')) : p.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
