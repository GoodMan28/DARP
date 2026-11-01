import { cx } from '@/lib/cx';

/** The first letters of a name's first and last words: "Dr. Anil K. Verma" gives "AV". */
export function initialsOf(name: string): string {
  const words = name.replace(/\b(dr|prof|professor|mr|mrs|ms|shri|smt)\b\.?/gi, ' ').split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]![0]!;
  const last = words.length > 1 ? words[words.length - 1]![0]! : '';
  return (first + last).toUpperCase();
}

const SIZE = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-xl' } as const;

/** Initials in a circle with a soft maroon tint. DARP holds no photographs. */
export function Avatar({ name, size = 'md', className }: { name: string; size?: keyof typeof SIZE; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-maroon-100 font-semibold text-maroon-800', SIZE[size], className)}
    >
      {initialsOf(name)}
    </span>
  );
}
