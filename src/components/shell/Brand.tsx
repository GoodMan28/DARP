import Image from 'next/image';
import { cx } from '@/lib/cx';

/**
 * The institutional lockup and the product mark, in that order.
 * Institution first, product second — the standard co-brand order.
 */
export function Lockup({
  height = 40, tone = 'light', className, showProduct = true,
}: { height?: number; tone?: 'light' | 'dark'; className?: string; showProduct?: boolean }) {
  return (
    <div className={cx('flex items-center gap-4', className)}>
      <div className={cx(tone === 'dark' && 'rounded-sm bg-white px-3 py-2')}>
        <Image
          src="/brand/bit-lockup.png"
          alt="Birla Institute of Technology, Mesra, Ranchi"
          height={height}
          width={Math.round(height * 4.3)}
          priority
          style={{ height, width: 'auto' }}
        />
      </div>
      {showProduct ? (
        <>
          <div className={cx('h-9 w-px', tone === 'dark' ? 'bg-white/25' : 'bg-line')} />
          <div>
            <div
              className={cx(
                'text-lg font-bold leading-none tracking-[0.06em]',
                tone === 'dark' ? 'text-white' : 'text-primary',
              )}
            >
              DARP
            </div>
            <div className={cx('mt-1 text-2xs', tone === 'dark' ? 'text-brand-200' : 'text-ink-muted')}>
              Accreditation Data Portal
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** The dark strip above the masthead — statutory identity, contact, nothing else. */
export function UtilityBar() {
  return (
    <div className="flex h-[30px] items-center bg-brand-900 px-4 text-[11.5px] text-brand-200 md:px-10">
      <span className="truncate">
        Deemed University under Section 3 of the UGC Act · Ranchi 835215, Jharkhand
      </span>
      <span className="ml-auto hidden truncate md:inline">
        Internal Quality Assurance Cell · iqac@bitmesra.ac.in · Extn. 2411
      </span>
    </div>
  );
}
