import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export interface NumbersTable { head: string[]; rows: Array<Array<string | number>> }

/**
 * A white card with soft shadow carrying one chart: its title, a one-line subtitle, the chart, and
 * "See the numbers", a table of exactly what is drawn, so no chart is the only way to read a figure.
 */
export function ChartCard({ title, subtitle, children, table, className, id }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  table?: NumbersTable;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cx('min-w-0 rounded-lg bg-surface p-5 shadow-sm ring-1 ring-line transition-shadow hover:shadow-md motion-reduce:transition-none', className)}>
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
      </header>
      {children}
      {table && table.rows.length > 0 ? (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer select-none font-semibold text-ink-muted hover:text-ink">See the numbers</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>{table.head.map((h, i) => <th key={h} className={cx('border-b border-line py-1.5 pr-3 font-semibold text-ink-muted', i > 0 && 'text-right')}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j} className={cx('border-b border-line/60 py-1.5 pr-3', j > 0 && 'text-right font-mono tabular-nums')}>
                        {typeof c === 'number' ? c.toLocaleString('en-IN') : c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}
