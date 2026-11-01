/** One grey line. An empty chart is never drawn: no axes with nothing on them. */
export function Empty({ thing }: { thing: string }) {
  return <p className="py-6 text-center text-sm text-ink-faint">No {thing} yet.</p>;
}
