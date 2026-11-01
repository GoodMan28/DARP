'use client';

import { useEffect, useId, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Button, Input, Select, Notice } from '@/components/ui';
import { INSTITUTE_KINDS, type InstituteHit } from '@darp/shared/institutions';

/**
 * "Not listed? Add it": a few answers about an organisation the directory lacks. It can be chosen at
 * once; IQAC reviews it afterwards and merges it into the entry it duplicates, if there is one.
 */
export function AddInstitute({ initialName, onAdded, onCancel }: {
  initialName: string;
  onAdded: (hit: InstituteHit) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState(INSTITUTE_KINDS[1]!.label);
  const [country, setCountry] = useState('India');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [countries, setCountries] = useState<string[]>(['India']);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiJson<string[]>('/api/institutions/countries').then((res) => { if (res.ok) setCountries(res.data); });
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setFields({});
    const res = await apiJson<InstituteHit>('/api/institutions', {
      method: 'POST', body: JSON.stringify({ name, kind, country, city, state: country === 'India' ? state : '' }),
    });
    setBusy(false);
    if (!res.ok) { setError(res.error.message); setFields(res.error.fields ?? {}); return; }
    onAdded(res.data);
  }

  const bad = (k: string) => (fields[k] ? true : undefined);
  const label = 'mb-1 block text-2xs font-semibold text-ink-muted';
  return (
    <div className="rounded-sm border border-line bg-surface-2 p-3" role="group" aria-label="Add an organisation">
      <p className="mb-2 text-sm font-semibold">Add an organisation</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-name`} className={label}>Full name</label>
          <Input id={`${id}-name`} value={name} maxLength={200} disabled={busy} aria-invalid={bad('name')} onChange={(e) => setName(e.target.value)} />
          {fields.name ? <p className="mt-1 text-2xs text-danger-700">{fields.name}</p> : null}
        </div>
        <div>
          <label htmlFor={`${id}-kind`} className={label}>Kind</label>
          <Select id={`${id}-kind`} value={kind} disabled={busy} onChange={(e) => setKind(e.target.value)}>
            {INSTITUTE_KINDS.map((k) => <option key={k.label} value={k.label}>{k.label}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor={`${id}-country`} className={label}>Country</label>
          <Select id={`${id}-country`} value={country} disabled={busy} aria-invalid={bad('country')} onChange={(e) => setCountry(e.target.value)}>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          {fields.country ? <p className="mt-1 text-2xs text-danger-700">{fields.country}</p> : null}
        </div>
        <div>
          <label htmlFor={`${id}-city`} className={label}>City (optional)</label>
          <Input id={`${id}-city`} value={city} maxLength={120} disabled={busy} onChange={(e) => setCity(e.target.value)} />
        </div>
        {country === 'India' ? (
          <div>
            <label htmlFor={`${id}-state`} className={label}>State (optional)</label>
            <Input id={`${id}-state`} value={state} maxLength={120} disabled={busy} onChange={(e) => setState(e.target.value)} />
          </div>
        ) : null}
      </div>
      {error && Object.keys(fields).length === 0 ? <Notice tone="danger" className="mt-3">{error}</Notice> : null}
      <div className="mt-3 flex gap-2">
        <Button type="button" disabled={busy || name.trim().length < 3} onClick={() => void save()}>{busy ? 'Adding…' : 'Add and use it'}</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
