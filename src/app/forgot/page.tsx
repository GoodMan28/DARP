import Link from 'next/link';
import { Lockup } from '@/components/shell/Brand';
import { ForgotForm } from './ForgotForm';

// Rendered per request so the CSP nonce from src/middleware.ts reaches Next's
// inline hydration scripts. A prerendered page cannot carry a per-request nonce.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Reset your password · DARP' };

export default function ForgotPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-2 px-4 py-10">
      <div className="w-full max-w-md">
        <Lockup height={38} className="mb-8" />
        <div className="rounded-sm border border-line bg-surface p-6">
          <h1 className="text-lg font-bold tracking-tight">Reset your password</h1>
          <p className="mb-5 mt-1 text-sm text-ink-muted">
            Enter your institute e-mail. If an account exists, IQAC will send a reset link to it.
          </p>
          <ForgotForm />
        </div>
        <p className="mt-4 text-2xs text-ink-faint">
          Still stuck? Write to iqac@bitmesra.ac.in or call extension 2411 ·{' '}
          <Link href="/login" className="text-primary hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
