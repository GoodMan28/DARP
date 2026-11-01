'use client';

import { useId, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Button, Input, Notice } from '@/components/ui';
import { IconAlert, IconCheck } from '@/components/shell/Icon';
import { formatDateTime } from '@darp/shared/format';
import type { IdentityPayload } from '@darp/shared/contracts';

const LINE_TONE = { success: 'text-success-700', warning: 'text-warning-700', danger: 'text-danger-700', neutral: 'text-ink-muted' } as const;

/** One check result: a tick or a warning sign, then a few words. */
function Line({ tone, children }: { tone: keyof typeof LINE_TONE; children: React.ReactNode }) {
  return (
    <li className={`flex items-start gap-1.5 ${LINE_TONE[tone]}`}>
      {tone === 'success' ? <IconCheck width={13} height={13} className="mt-px shrink-0" />
        : tone === 'neutral' ? <span className="w-[13px] shrink-0 text-center">–</span>
          : <IconAlert width={13} height={13} className="mt-px shrink-0" />}
      <span>{children}</span>
    </li>
  );
}

/**
 * The person's ORCID iD. Saving checks it with ORCID's public record: when that record carries the
 * same name, a paper listing this iD counts as "Confirmed by ORCID".
 */
export function OrcidBox({ initial }: { initial: IdentityPayload }) {
  const id = useId();
  const [identity, setIdentity] = useState(initial);
  const [value, setValue] = useState(initial.orcid ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await apiJson<IdentityPayload>('/api/profile/orcid', { method: 'POST', body: JSON.stringify({ orcid: value }) });
    setBusy(false);
    if (!res.ok) { setError(res.error.fields?.orcid ?? res.error.message); return; }
    setIdentity(res.data);
    setValue(res.data.orcid ?? '');
    // The research card below reads its IDs from the ORCID record: show what was found.
    window.location.reload();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await apiJson<IdentityPayload>('/api/profile/orcid', { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) { setError(res.error.message); return; }
    setIdentity(res.data);
    setValue('');
    window.location.reload();
  }

  const c = identity.orcidCheck;
  return (
    <div className="border-t border-line p-4">
      <label htmlFor={`${id}-orcid`} className="mb-1 block text-xs font-semibold text-ink-muted">ORCID iD</label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`${id}-orcid`}
          className="w-64 font-mono"
          placeholder="0000-0002-1825-0097"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button variant="secondary" disabled={busy || !value.trim() || value.trim() === identity.orcid} onClick={() => void save()}>
          {busy ? 'Checking…' : identity.orcid ? 'Check and save' : 'Save'}
        </Button>
        {identity.orcid ? <Button variant="ghost" disabled={busy} onClick={() => void remove()}>Remove</Button> : null}
      </div>
      <p className="mt-1 text-xs text-ink-muted">Papers that list your ORCID iD are confirmed automatically.</p>
      {error ? <Notice tone="danger" className="mt-2">{error}</Notice> : null}
      {identity.orcid && c ? (
        <ul className="mt-2 space-y-1 text-xs">
          {c.unchecked ? (
            <Line tone="warning">ORCID could not be reached. Try again later.</Line>
          ) : (
            <>
              {c.nameMatches ? (
                <Line tone="success">Name matches ORCID ({c.orcidName})</Line>
              ) : (
                <Line tone="danger">
                  Name on ORCID ({c.orcidName || 'not shown'}) does not match your account. Correct your name above, or fix it on orcid.org.
                </Line>
              )}
              {c.bitEmployment ? <Line tone="success">BIT Mesra listed as your employer</Line> : <Line tone="neutral">BIT Mesra not listed as your employer (optional)</Line>}
            </>
          )}
          <li className="pl-5 text-ink-faint">Checked {formatDateTime(c.checkedAt)}</li>
        </ul>
      ) : null}
    </div>
  );
}
