import { CountUp } from './CountUp';

/** One figure on the hero band: white at 10% with a thin white border at 15%. A number counts up; text is shown as it is. */
export function HeroTile({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="self-start rounded-lg bg-white/10 px-4 py-3 ring-1 ring-white/15">
      <div className="whitespace-nowrap text-xl font-semibold leading-none sm:text-2xl">
        {typeof value === 'number' ? <CountUp value={value} /> : <span className="font-mono tabular-nums">{value}</span>}
      </div>
      <div className="mt-1.5 text-2xs text-white/75">{label}</div>
      {note ? <div className="mt-0.5 text-2xs text-white/55">{note}</div> : null}
    </div>
  );
}
