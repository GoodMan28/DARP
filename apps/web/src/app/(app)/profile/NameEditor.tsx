'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiJson } from '@/lib/csrf-client';
import { Button, Input, Select, Notice } from '@/components/ui';
import { NAME_PREFIXES, type NameParts } from '@darp/shared/names';
import type { IdentityPayload } from '@darp/shared/contracts';

/** The person's name in four parts, with an Edit button. Nothing else on the account is changed here. */
export function NameEditor({ initial }: { initial: NameParts }) {
  const id = useId();
  const router = useRouter();
  const [parts, setParts] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function save() {
    setBusy(true);
    setError(null);
    setFields({});
    const res = await apiJson<IdentityPayload>('/api/profile/name', {
      method: 'PATCH',
      body: JSON.stringify({ namePrefix: draft.prefix, firstName: draft.first, middleName: draft.middle, lastName: draft.last }),
    });
    setBusy(false);
    if (!res.ok) { setError(res.error.message); setFields(res.error.fields ?? {}); return; }
    const d = res.data;
    setParts({ prefix: d.namePrefix, first: d.firstName, middle: d.middleName, last: d.lastName });
    setEditing(false);
    router.refresh();     // the header and the profile read the name again
  }

  const set = (k: keyof NameParts) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const rows: Array<[keyof NameParts, string, string]> = [
    ['prefix', 'Prefix', 'namePrefix'], ['first', 'First name', 'firstName'], ['middle', 'Middle name', 'middleName'], ['last', 'Last name', 'lastName'],
  ];

  return (
    <div className="border-b border-line p-4">
      {editing ? (
        <div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {rows.map(([k, label, field]) => (
              <div key={k} className="min-w-0">
                <label htmlFor={`${id}-${k}`} className="mb-1 block text-2xs font-semibold text-ink-muted">{label}</label>
                {k === 'prefix' ? (
                  <Select id={`${id}-${k}`} value={draft.prefix} disabled={busy} onChange={(e) => set(k)(e.target.value)}>
                    <option value="">None</option>
                    {NAME_PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                ) : (
                  <Input id={`${id}-${k}`} value={draft[k]} disabled={busy} maxLength={60} aria-invalid={fields[field] ? true : undefined} onChange={(e) => set(k)(e.target.value)} />
                )}
                {fields[field] ? <p className="mt-1 text-2xs text-danger-700">{fields[field]}</p> : null}
              </div>
            ))}
          </div>
          {error && Object.keys(fields).length === 0 ? <Notice tone="danger" className="mt-3">{error}</Notice> : null}
          <div className="mt-3 flex gap-2">
            <Button disabled={busy || !draft.first.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save name'}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setDraft(parts); setEditing(false); setError(null); setFields({}); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <dl className="grid flex-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {rows.map(([k, label]) => (
              <div key={k} className="min-w-0">
                <dt className="text-2xs font-semibold text-ink-muted">{label}</dt>
                <dd className="truncate text-sm text-ink">{parts[k] || '—'}</dd>
              </div>
            ))}
          </dl>
          <Button variant="secondary" onClick={() => { setDraft(parts); setEditing(true); }}>Edit name</Button>
        </div>
      )}
    </div>
  );
}
