'use client';

import { useId, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Button, Input, Notice } from '@/components/ui';
import { formatDateTime } from '@darp/shared/format';
import type { IdentityPayload } from '@darp/shared/contracts';

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
      <p className="mt-1 text-xs text-ink-muted">
        Papers that list your ORCID iD are marked “Confirmed by ORCID”, so DRIE and IQAC need not check them.
        Find yours on orcid.org.
      </p>
      {error ? <Notice tone="danger" className="mt-2">{error}</Notice> : null}
      {identity.orcid && c ? (
        <ul className="mt-2 space-y-0.5 text-xs">
          {c.unchecked ? (
            <li className="text-warning-700">ORCID could not be reached. Press “Check and save” again later; until then the iD is not used.</li>
          ) : (
            <>
              <li className={c.nameMatches ? 'text-success-700' : 'text-danger-700'}>
                {c.nameMatches
                  ? `Name on ORCID: ${c.orcidName}. It matches your account, so the iD is used to confirm authorship.`
                  : `Name on ORCID: ${c.orcidName || 'not shown'}. It does not match your account name, so the iD is not used. Ask IQAC to correct your name, or fix it on orcid.org.`}
              </li>
              <li className={c.bitEmployment ? 'text-success-700' : 'text-ink-muted'}>
                {c.bitEmployment ? 'BIT Mesra is listed as your employer on ORCID.' : 'BIT Mesra is not listed as your employer on ORCID (optional, but worth adding there).'}
              </li>
            </>
          )}
          <li className="text-ink-faint">Checked {formatDateTime(c.checkedAt)}</li>
        </ul>
      ) : null}
    </div>
  );
}
