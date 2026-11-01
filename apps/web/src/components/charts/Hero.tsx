import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

/**
 * The deep maroon band at the top of the Overview, department and college pages: a title, a few chips,
 * and a row of figures. `aside` is a card that sits to the right on a wide screen and below on a phone.
 */
export function Hero({ lead, title, subtitle, chips, children, aside, columns = 4, className }: {
  /** Usually an Avatar. */
  lead?: ReactNode;
  title: string;
  subtitle?: string;
  chips?: string[];
  children?: ReactNode;
  aside?: ReactNode;
  /** How many tiles fit in a row on a wide screen. */
  columns?: 4 | 6;
  className?: string;
}) {
  return (
    <section className={cx('rounded-lg bg-gradient-to-br from-maroon-900 to-maroon-700 p-5 text-white shadow-md sm:p-6', className)}>
      <div className={cx('grid gap-5', !!aside && 'lg:grid-cols-[1fr_20rem]')}>
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            {lead}
            <div className="min-w-0">
              <h2 className="text-xl font-semibold leading-tight sm:text-2xl">{title}</h2>
              {subtitle ? <p className="mt-1 text-sm text-white/75">{subtitle}</p> : null}
              {chips && chips.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {chips.map((c) => <li key={c} className="rounded-full bg-white/10 px-2.5 py-0.5 text-2xs text-white/90 ring-1 ring-white/15">{c}</li>)}
                </ul>
              ) : null}
            </div>
          </div>
          {children ? <div className={cx('mt-5 grid grid-cols-2 gap-3', columns === 6 ? 'md:grid-cols-3 xl:grid-cols-6' : 'md:grid-cols-4')}>{children}</div> : null}
        </div>
        {aside ? <div className="min-w-0">{aside}</div> : null}
      </div>
    </section>
  );
}
