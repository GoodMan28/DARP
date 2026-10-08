'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiJson } from '@/lib/csrf-client';
import { Button, Field, Textarea, Notice } from '@/components/ui';
import { IconCheck, IconUndo, IconShield, IconLock, IconSend } from '@/components/shell/Icon';

export type RailAction = 'submit' | 'verify' | 'return' | 'approve' | 'unlock';

const COPY: Record<RailAction, { label: string; busy: string; note: string }> = {
  submit: {
    label: 'Submit for verification',
    busy: 'Submitting…',
    note: 'Sends the record to the verifying office. You cannot edit it again until it is returned.',
  },
  verify: {
    label: 'Verify record',
    busy: 'Verifying…',
    note: 'Confirms the entry matches the evidence. IQAC approves it afterwards.',
  },
  return: {
    label: 'Return to owner',
    busy: 'Returning…',
    note: 'Sends it back for correction. A remark is required so the owner knows what to fix.',
  },
  approve: {
    label: 'Approve record',
    busy: 'Approving…',
    note: 'Locks the record into the cycle. Approved records feed the exported workbooks.',
  },
  unlock: {
    label: 'Unlock record',
    busy: 'Unlocking…',
    note: 'Returns an approved record to verified so it can be corrected. Audited.',
  },
};

function Glyph({ action }: { action: RailAction }) {
  if (action === 'return') return <IconUndo width={13} height={13} />;
  if (action === 'approve') return <IconShield width={13} height={13} />;
  if (action === 'unlock') return <IconLock width={13} height={13} />;
  if (action === 'submit') return <IconSend width={13} height={13} />;
  return <IconCheck width={13} height={13} />;
}

/**
 * The workflow rail. It renders only the actions the page decided the viewer may take —
 * the server re-checks every one of them, so this list is convenience, never authority.
 */
/** In modules approved on submission (Publications) the office's verification is final. */
const VERIFY_FINAL = {
  label: 'Verify and approve',
  busy: 'Approving…',
  note: 'Confirms the entry matches the evidence. This is final — no IQAC approval follows; IQAC can still return it later.',
};

export function ActionRail({
  moduleKey, recordId, actions, verifyIsFinal = false,
}: { moduleKey: string; recordId: string; actions: RailAction[]; verifyIsFinal?: boolean }) {
  const copy = (a: RailAction) => (a === 'verify' && verifyIsFinal ? VERIFY_FINAL : COPY[a]);
  const router = useRouter();
  const [busy, setBusy] = useState<RailAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remark, setRemark] = useState('');
  const [remarkError, setRemarkError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const remarkId = useId();

  if (actions.length === 0) return null;

  async function run(action: RailAction, note?: string) {
    setBusy(action);
    setError(null);
    const res = await apiJson<{ status: string }>(
      `/api/modules/${moduleKey}/records/${recordId}/transition`,
      { method: 'POST', body: JSON.stringify(note ? { action, remark: note } : { action }) },
    );
    setBusy(null);
    if (!res.ok) {
      if (action === 'return' && res.error.fields?.remark) setRemarkError(res.error.fields.remark);
      else setError(res.error.message);
      return;
    }
    setReturning(false);
    setRemark('');
    router.refresh();
  }

  function submitReturn() {
    if (!remark.trim()) {
      setRemarkError('Say what needs correcting — the owner only sees this remark.');
      return;
    }
    setRemarkError(null);
    void run('return', remark.trim());
  }

  return (
    <div className="space-y-3">
      {error ? <Notice tone="danger" title="That action did not go through">{error}</Notice> : null}

      <div className="flex flex-col gap-2">
        {actions.map((action) => {
          if (action === 'return') {
            return (
              <Button
                key={action}
                type="button"
                variant="secondary"
                aria-expanded={returning}
                aria-controls={remarkId}
                disabled={busy !== null}
                onClick={() => { setReturning(!returning); setRemarkError(null); }}
              >
                <Glyph action="return" />
                {COPY.return.label}
              </Button>
            );
          }
          return (
            <Button
              key={action}
              type="button"
              variant={action === 'unlock' ? 'secondary' : action === 'approve' ? 'success' : 'primary'}
              disabled={busy !== null}
              onClick={() => void run(action)}
            >
              <Glyph action={action} />
              {busy === action ? copy(action).busy : copy(action).label}
            </Button>
          );
        })}
      </div>

      {returning ? (
        <div id={remarkId} className="rounded-sm border border-line bg-surface-2 p-3">
          <Field
            label="Why is this being returned?"
            required
            htmlFor={`${remarkId}-text`}
            error={remarkError ?? undefined}
            help="The owner sees this remark on their list and on the record."
          >
            <Textarea
              id={`${remarkId}-text`}
              value={remark}
              maxLength={1000}
              rows={3}
              aria-invalid={remarkError ? true : undefined}
              onChange={(e) => { setRemark(e.target.value); setRemarkError(null); }}
              placeholder="For example: the ISSN does not match the journal named."
            />
          </Field>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="danger" disabled={busy !== null} onClick={submitReturn}>
              {busy === 'return' ? COPY.return.busy : 'Return with this remark'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setReturning(false); setRemarkError(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <ul className="space-y-1.5 text-xs text-ink-muted">
        {actions.map((a) => <li key={a}>{copy(a).note}</li>)}
      </ul>
    </div>
  );
}
