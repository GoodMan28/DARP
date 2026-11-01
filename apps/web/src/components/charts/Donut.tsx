'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { Empty } from './Empty';
import { ANIMATION_MS, QUARTILE, SERIES, num } from './theme';
import { useMotionOk } from './useMotion';

export interface Slice { name: string; value: number; color?: string }

const MAX = 5;

/**
 * A ring with 2px gaps between slices, the total in the middle and a legend beside it: colour square, name,
 * count and percent. Five slices at most (the sixth and later are folded into "Other"): for more, use BarList.
 */
export function Donut({ slices, centre = 'total', size = 168, thing = 'figures' }: {
  slices: Slice[];
  /** The small word under the total. */
  centre?: string;
  size?: number;
  thing?: string;
}) {
  const animate = useMotionOk();
  const live = slices.filter((s) => s.value > 0);
  const total = live.reduce((a, s) => a + s.value, 0);
  if (total === 0) return <Empty thing={thing} />;
  const head = live.slice(0, MAX);
  const rest = live.slice(MAX).reduce((a, s) => a + s.value, 0);
  const shown: Slice[] = rest > 0 ? [...head.slice(0, MAX - 1), { name: 'Other', value: rest + (head[MAX - 1]?.value ?? 0), color: QUARTILE.none }] : head;
  const colored = shown.map((s, i) => ({ ...s, color: s.color ?? SERIES[i % SERIES.length]! }));
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <div className="relative shrink-0" style={{ width: size, height: size }} role="img"
        aria-label={`${colored.map((s) => `${s.name} ${s.value}`).join(', ')}. ${total} ${centre}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip format={(v) => `${num(v)} (${Math.round((v / total) * 100)}%)`} />} />
            <Pie data={colored} dataKey="value" nameKey="name" innerRadius="70%" outerRadius="100%" paddingAngle={2}
              startAngle={90} endAngle={-270} stroke="none" isAnimationActive={animate} animationDuration={ANIMATION_MS}>
              {colored.map((s) => <Cell key={s.name} fill={s.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-2xl font-semibold tabular-nums text-ink">{num(total)}</span>
          <span className="text-2xs text-ink-muted">{centre}</span>
        </div>
      </div>
      <ul className="min-w-[10rem] flex-1 space-y-2 text-sm">
        {colored.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="text-ink">{s.name}</span>
            <span className="ml-auto pl-3 font-mono tabular-nums text-ink">{num(s.value)}</span>
            <span className="w-10 text-right font-mono text-2xs tabular-nums text-ink-muted">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
