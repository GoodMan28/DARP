import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { Lockup } from '@/components/shell/Brand';
import { ChangePasswordForm } from './ChangePasswordForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Change password · DARP' };

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-2 px-4 py-10">
      <div className="w-full max-w-md">
        <Lockup height={38} className="mb-8" />
        <div className="rounded-sm border border-line bg-surface p-6">
          <h1 className="text-lg font-bold tracking-tight">
            {user.mustChangePassword ? 'Set your password' : 'Change your password'}
          </h1>
          <p className="mb-5 mt-1 text-sm text-ink-muted">
            {user.mustChangePassword
              ? 'Your account was created by IQAC with a temporary password. Choose your own before continuing.'
              : 'Changing your password signs you out of every other device.'}
          </p>
          <ChangePasswordForm />
        </div>
        <p className="mt-4 text-2xs text-ink-faint">
          At least 12 characters, using three of: lower case, upper case, digits, symbols.
        </p>
      </div>
    </div>
  );
}
