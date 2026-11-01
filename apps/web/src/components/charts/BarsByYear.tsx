'use client';

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { Empty } from './Empty';
import { ACCENT, ANIMATION_MS, AXIS_TEXT, GRID, num, rupeesShort } from './theme';
import { useMotionOk } from './useMotion';

/**
 * Vertical bars by year: one series, one axis. Only the highest bar and the last one carry their number; the
 * rest are read by hovering. `unit` says how a value reads (a plain count, or rupees).
 */
export function BarsByYear({ data, name, unit = 'count', color = ACCENT, height = 220, thing = 'figures' }: {
  data: Array<{ year: number; value: number }>;
  /** What the bars count, for the tooltip: "Papers". */
  name: string;
  unit?: 'count' | 'rupees';
  color?: string;
  height?: number;
  thing?: string;
}) {
  const animate = useMotionOk();
  const rows = data.filter((d) => d.value > 0 || data.length > 1);
  if (data.every((d) => d.value === 0)) return <Empty thing={thing} />;
  const show = (v: number) => (unit === 'rupees' ? rupeesShort(v) : num(v));
  const peak = rows.reduce((best, d, i) => (d.value > (rows[best]?.value ?? -1) ? i : best), 0);
  const last = rows.length - 1;
  return (
    <div>
      <div style={{ height }} role="img" aria-label={`${name} by year. Highest ${show(rows[peak]!.value)} in ${rows[peak]!.year}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 18, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 12 }} interval="preserveStartEnd" />
            <Tooltip cursor={{ fill: 'rgb(9 30 66 / 0.04)' }} content={<ChartTooltip format={(v) => show(v)} />} />
            <Bar dataKey="value" name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28}
              isAnimationActive={animate} animationDuration={ANIMATION_MS}>
              <LabelList dataKey="value" content={(p) => {
                const i = Number(p.index);
                if (i !== peak && i !== last) return null;
                const x = Number(p.x) + Number(p.width) / 2;
                return <text x={x} y={Number(p.y) - 6} textAnchor="middle" fontSize={12} fill="#172b4d" className="font-mono">{show(Number(p.value))}</text>;
              }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-2xs text-ink-muted">Highest: <span className="font-mono tabular-nums">{show(rows[peak]!.value)}</span> in {rows[peak]!.year}</p>
    </div>
  );
}
