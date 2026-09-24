import Image from 'next/image';
import Link from 'next/link';
import { Lockup } from '@/components/shell/Brand';
import { LoginForm } from './LoginForm';

// Rendered per request so the CSP nonce from src/middleware.ts reaches Next's
// inline hydration scripts. A prerendered page cannot carry a per-request nonce.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in · DARP' };

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh bg-surface-2">
      {/* brand panel */}
      <div className="relative hidden w-[46%] max-w-[620px] shrink-0 overflow-hidden bg-brand-900 lg:block">
        <Image
          src="/brand/login-bg.jpg"
          alt=""
          fill
          priority
          sizes="620px"
          className="object-cover object-[center_40%]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(175deg, rgba(15,13,54,.92) 0%, rgba(18,16,64,.84) 50%, rgba(24,21,84,.72) 100%)',
          }}
        />
        <div className="relative flex h-full flex-col p-12">
          <Lockup height={42} tone="dark" showProduct={false} />
          <div className="mt-auto">
            <div className="text-3xl font-bold tracking-[0.08em] text-white">DARP</div>
            <div className="mt-1.5 text-md text-brand-200">Accreditation Data Portal</div>
            <div className="my-5 h-0.5 w-6 bg-gold-500" />
            <div className="text-xs leading-relaxed text-brand-300">
              NAAC · NIRF · QS
              <br />
              Internal Quality Assurance Cell
            </div>
          </div>
        </div>
      </div>

      {/* form panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[356px]">
          <div className="mb-8 lg:hidden">
            <Lockup height={38} />
          </div>
          <h1 className="mb-6 text-xl font-bold tracking-tight">Sign in</h1>
          <LoginForm />
          <p className="mt-6 text-2xs leading-relaxed text-ink-faint">
            Accounts are created by IQAC ·{' '}
            <Link href="/" className="text-primary hover:underline">Back to home</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
