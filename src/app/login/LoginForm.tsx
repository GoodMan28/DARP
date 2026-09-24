'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiJson } from '@/lib/csrf-client';
import { Field, Input, Button, Checkbox, Notice } from '@/components/ui';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson<{ next: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    window.location.href = res.data.next;
  }

  return (
    <form onSubmit={submit} noValidate>
      {error ? <Notice tone="danger" className="mb-4">{error}</Notice> : null}

      <div className="mb-4">
        <Field label="Institute e-mail" htmlFor="email">
          <Input
            id="email"
            type="email"
            name="email"
            autoComplete="username"
            required
            placeholder="name@bitmesra.ac.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      </div>

      <div className="mb-4">
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <Checkbox name="remember" />
          Keep me signed in
        </label>
        <Link href="/forgot" className="text-xs text-primary hover:underline">Forgot password?</Link>
      </div>

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
