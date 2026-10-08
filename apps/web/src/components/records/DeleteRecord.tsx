'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/csrf-client';
import { Button, Notice } from '@/components/ui';

/** Deletes the owner's own draft or returned record, after a confirmation. */
export function DeleteRecord({ moduleKey, recordId }: { moduleKey: string; recordId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/modules/${moduleKey}/records/${recordId}`, { method: 'DELETE' });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!json?.ok) {
      setError(json?.error?.message ?? 'The record could not be deleted.');
      return;
    }
    window.location.href = `/m/${moduleKey}?deleted=1`;
  }

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
        Delete this record
      </Button>
    );
  }
  return (
    <Notice tone="danger" title="Delete this record?">
      It is removed from your list and from every total. This cannot be undone from the portal.
      {error ? <p className="mt-1 font-semibold">{error}</p> : null}
      <span className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="danger" disabled={busy} onClick={() => void remove()}>
          {busy ? 'Deleting…' : 'Delete'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
      </span>
    </Notice>
  );
}
