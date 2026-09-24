'use client';

import { useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Field, Input, Button, Notice } from '@/components/ui';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await apiJson('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
    setBusy(false);
    // The response is identical whether or not the account exists.
    setSent(true);
  }

  if (sent) {
    return (
      <Notice tone="info" title="Check your e-mail">
        If an account exists for {email || 'that address'}, a reset link is on its way. The link
        expires in 30 minutes.
      </Notice>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Institute e-mail" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="username"
          required
          placeholder="name@bitmesra.ac.in"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
