'use client';

import { useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Input, Select, Button, Notice } from '@/components/ui';

interface Declared {
  key: string;
  label: string;
  help: string;
  format: 'number' | 'yesno';
  value: number;
}

export function DeclaredCounters({ initial }: { initial: Declared[] }) {
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(initial.map((d) => [d.key, d.value])),
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (initial.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-ink-muted">No declared figures configured.</p>;
  }

  async function save(key: string, value: number) {
    setSavingKey(key);
    setError(null);
    const res = await apiJson('/api/profile/rollups', {
      method: 'PATCH',
      body: JSON.stringify({ counterKey: key, value }),
    });
    setSavingKey(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setSavedKey(key);
    window.setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 2000);
  }

  return (
    <div>
      {error ? <div className="p-4 pb-0"><Notice tone="danger">{error}</Notice></div> : null}
      <ul className="divide-y divide-line">
        {initial.map((d) => (
          <li key={d.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <label htmlFor={`d-${d.key}`} className="block text-sm text-ink">{d.label}</label>
              {d.help ? <p className="text-2xs text-ink-muted">{d.help}</p> : null}
            </div>

            {d.format === 'yesno' ? (
              <Select
                id={`d-${d.key}`}
                className="w-28"
                value={String(values[d.key] ?? 0)}
                onChange={(e) => setValues((v) => ({ ...v, [d.key]: Number(e.target.value) }))}
              >
                <option value="0">No</option>
                <option value="1">Yes</option>
              </Select>
            ) : (
              <Input
                id={`d-${d.key}`}
                className="w-28 text-right font-mono tabular-nums"
                inputMode="numeric"
                value={String(values[d.key] ?? 0)}
                onChange={(e) => setValues((v) => ({
                  ...v, [d.key]: Number(e.target.value.replace(/[^\d]/g, '') || 0),
                }))}
              />
            )}

            <Button
              type="button"
              variant="secondary"
              disabled={savingKey === d.key}
              onClick={() => void save(d.key, values[d.key] ?? 0)}
            >
              {savingKey === d.key ? 'Saving…' : savedKey === d.key ? 'Saved' : 'Save'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
