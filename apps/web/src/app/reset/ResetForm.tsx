'use client';

import { useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Field, Input, Button, Notice } from '@/components/ui';

export function ResetForm({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <Notice tone="danger" title="This link is incomplete">
        Open the reset link from your e-mail again, or ask IQAC for a new one.
      </Notice>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    if (newPassword !== confirm) {
      setErrors({ confirm: 'Both entries must match.' });
      return;
    }
    setErrors({});
    setBusy(true);
    const res = await apiJson('/api/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.error.fields ?? {});
      if (!res.error.fields) setBanner(res.error.message);
      return;
    }
    window.location.href = '/login?reset=1';
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {banner ? <Notice tone="danger">{banner}</Notice> : null}
      <Field label="New password" htmlFor="new" error={errors.newPassword}>
        <Input
          id="new"
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={errors.confirm}>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Saving…' : 'Set password'}
      </Button>
    </form>
  );
}
