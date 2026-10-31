'use client';

import { useId, useState } from 'react';
import { apiFetch } from '@/lib/csrf-client';
import { Button, Field, Textarea } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/** Deletes a record after a clean confirmation; a reason is asked for when the server says it is needed. */
export function DeleteRecord({
  moduleKey, recordId, needsReason, byIqac,
}: { moduleKey: string; recordId: string; needsReason: boolean; byIqac?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const short = needsReason && reason.trim().length < 5;

  async function remove() {
    setBusy(true);
    setError(null);
    const qs = needsReason ? `?reason=${encodeURIComponent(reason.trim())}` : '';
    const res = await apiFetch(`/api/modules/${moduleKey}/records/${recordId}${qs}`, { method: 'DELETE' });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!json?.ok) {
      setError(json?.error?.message ?? 'The record could not be deleted.');
      return;
    }
    window.location.href = `/m/${moduleKey}?deleted=1`;
  }

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => { setOpen(true); setError(null); }}>
        Delete this record
      </Button>
      <ConfirmDialog
        open={open}
        title="Delete this record?"
        stayLabel="Keep it"
        confirmLabel={busy ? 'Deleting…' : 'Delete'}
        busy={busy}
        confirmDisabled={short}
        onConfirm={() => void remove()}
        onCancel={() => setOpen(false)}
      >
        <p>
          {byIqac ? 'It is removed from its owner’s list and from every total. ' : 'It is removed from your list and from every total. '}
          IQAC can bring it back if this was a mistake.
        </p>
        {needsReason ? (
          <div className="mt-3">
            <Field label="Why is it being deleted?" required htmlFor={`${id}-reason`} help="5 to 300 characters. For example: entered twice.">
              <Textarea id={`${id}-reason`} value={reason} maxLength={300} rows={2} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
        ) : null}
        {error ? <p role="alert" className="mt-2 font-semibold text-danger-700">{error}</p> : null}
      </ConfirmDialog>
    </>
  );
}
