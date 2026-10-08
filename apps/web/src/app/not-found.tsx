import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Not found · DARP' };

/**
 * Shown for an address that does not exist, and for a record or module the signed-in person may
 * not open — the two are deliberately indistinguishable, so nobody learns that a record exists.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="max-w-md rounded-sm border border-line bg-surface p-6 text-center">
        <p className="font-mono text-2xs font-bold uppercase tracking-wider text-ink-faint">404</p>
        <h1 className="mt-1 text-lg font-semibold text-ink">This page cannot be opened</h1>
        <p className="mt-2 text-sm text-ink-muted">
          It does not exist, or it is not yours to open — a record entered by someone else, or a module
          your role does not use.
        </p>
        <a
          href="/dashboard"
          className="mt-4 inline-flex min-h-9 items-center justify-center rounded-sm bg-primary px-3.5 py-2 text-sm font-semibold text-ink-invert no-underline hover:bg-primary-hover"
        >
          Go to your overview
        </a>
      </div>
    </main>
  );
}
