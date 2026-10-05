'use client';

import { useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Field, Input, Button, Notice } from '@/components/ui';

export function ChangePasswordForm() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    if (newPassword !== confirm) {
      setErrors({ confirm: 'Both entries must match.' });
      return;
    }
    setErrors({});
    setBusy(true);
    const res = await apiJson<{ changed: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.error.fields ?? {});
      setBanner(res.error.fields ? null : res.error.message);
      return;
    }
    window.location.href = '/dashboard';
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {banner ? <Notice tone="danger">{banner}</Notice> : null}

      <Field label="Current password" htmlFor="cur" error={errors.currentPassword}>
        <Input
          id="cur"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>

      <Field label="New password" htmlFor="new" error={errors.newPassword}>
        <Input
          id="new"
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNext(e.target.value)}
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
        {busy ? 'Saving…' : 'Save password'}
      </Button>
    </form>
  );
}
