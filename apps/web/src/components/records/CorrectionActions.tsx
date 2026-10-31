'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiJson } from '@/lib/csrf-client';
import { Button, Field } from '@/components/ui';
import { RemarkEditor } from './RemarkEditor';

/** For a record the reviewer returned and the owner corrected: "Checked", or "Return again" with a remark. */
export function CorrectionActions({ moduleKey, recordId }: { moduleKey: string; recordId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'ack' | 'return' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [remark, setRemark] = useState('');
  const id = useId();

  async function run(action: 'ack' | 'return') {
    if (action === 'return' && !remark.trim()) { setError('Say what still needs correcting.'); return; }
    setBusy(action);
    setError(null);
    const res = await apiJson(`/api/modules/${moduleKey}/records/${recordId}/transition`, {
      method: 'POST', body: JSON.stringify(action === 'return' ? { action, remark: remark.trim() } : { action }),
    });
    setBusy(null);
    if (!res.ok) { setError(res.error.message); return; }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void run('ack')}>
          {busy === 'ack' ? 'Saving…' : 'Checked — no further action'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy !== null} aria-expanded={returning} onClick={() => setReturning(!returning)}>
          Return again
        </Button>
      </div>
      {returning ? (
        <div className="w-full min-w-72 rounded-sm border border-line bg-surface-2 p-3 text-left">
          <Field label="What still needs correcting?" required htmlFor={`${id}-text`}>
            <RemarkEditor id={`${id}-text`} value={remark} onChange={(v) => { setRemark(v); setError(null); }} />
          </Field>
          <Button type="button" variant="danger" className="mt-2" disabled={busy !== null} onClick={() => void run('return')}>
            {busy === 'return' ? 'Returning…' : 'Return with this remark'}
          </Button>
        </div>
      ) : null}
      {error ? <span role="alert" className="text-sm text-danger-700">{error}</span> : null}
    </div>
  );
}
