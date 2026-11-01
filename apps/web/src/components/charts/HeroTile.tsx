import Link from 'next/link';
import { CountUp } from './CountUp';

/**
 * One figure on the hero band: white at 10% with a thin white border at 15%. A number counts up; text is
 * shown as it is. With `href` the tile is a link.
 */
export function HeroTile({ label, value, note, href }: { label: string; value: number | string; note?: string; href?: string }) {
  const body = (
    <>
      <div className="whitespace-nowrap text-xl font-semibold leading-none sm:text-2xl">
        {typeof value === 'number' ? <CountUp value={value} /> : <span className="font-mono tabular-nums">{value}</span>}
      </div>
      <div className="mt-1.5 text-2xs text-white/75">{label}</div>
      {note ? <div className="mt-0.5 text-2xs text-white/55">{note}</div> : null}
    </>
  );
  const box = 'self-start rounded-lg bg-white/10 px-4 py-3 ring-1 ring-white/15';
  return href
    ? <Link href={href} className={`${box} block transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white`}>{body}</Link>
    : <div className={box}>{body}</div>;
}
