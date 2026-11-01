'use client';

import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { Empty } from './Empty';
import { ACCENT, ANIMATION_MS, AXIS_TEXT, GRID, num, rupeesShort } from './theme';
import { useMotionOk } from './useMotion';

/** A soft fade under a 2px line: funding by year. The fade belongs to this chart and the hero only. */
export function Trend({ data, name, unit = 'rupees', color = ACCENT, height = 220, thing = 'figures' }: {
  data: Array<{ year: number; value: number }>;
  name: string;
  unit?: 'count' | 'rupees';
  color?: string;
  height?: number;
  thing?: string;
}) {
  const animate = useMotionOk();
  const gradient = `trend-${useId().replace(/[^a-z0-9]/gi, '')}`;
  if (data.every((d) => d.value === 0)) return <Empty thing={thing} />;
  const show = (v: number) => (unit === 'rupees' ? rupeesShort(v) : num(v));
  return (
    <div style={{ height }} role="img" aria-label={`${name} by year`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 12 }} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} width={unit === 'rupees' ? 62 : 36} tick={{ fill: AXIS_TEXT, fontSize: 12 }} tickFormatter={show} />
          <Tooltip content={<ChartTooltip format={(v) => show(v)} />} />
          <Area type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2} fill={`url(#${gradient})`}
            dot={{ r: 3, strokeWidth: 2, stroke: '#fff', fill: color }} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
            isAnimationActive={animate} animationDuration={ANIMATION_MS} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
