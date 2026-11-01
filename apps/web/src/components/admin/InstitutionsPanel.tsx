'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Button, Card, CardHeader, Notice, Table, Td, Th } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconPlus } from '@/components/shell/Icon';
import { AddInstitute } from '@/components/form/AddInstitute';
import { InstitutionPicker } from '@/components/form/InstitutionPicker';
import type { InstituteHit } from '@darp/shared/institutions';

interface Pending extends InstituteHit { kind: string | null; addedBy: string | null; addedAt: string; records: number }

/**
 * Organisations people added because the directory lacked them. IQAC approves one that is right, or
 * merges it into the entry it duplicates, which rewrites every record that used it. Adding one here
 * needs no review.
 */
export function InstitutionsPanel() {
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [merging, setMerging] = useState<{ from: Pending; into: InstituteHit | null } | null>(null);

  const load = useCallback(async () => {
    const res = await apiJson<{ pending: Pending[]; total: number }>('/api/admin/institutions');
    if (!res.ok) { setError(res.error.message); return; }
    setPending(res.data.pending);
    setTotal(res.data.total);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function approve(p: Pending) {
    setBusy(true); setError(null); setNotice(null);
    const res = await apiJson('/api/admin/institutions/approve', { method: 'POST', body: JSON.stringify({ code: p.code }) });
    setBusy(false);
    if (!res.ok) { setError(res.error.message); return; }
    setNotice(`${p.name} approved.`);
    await load();
  }

  async function merge() {
    if (!merging?.into) return;
    setBusy(true); setError(null); setNotice(null);
    const res = await apiJson<{ records: number; keyClashes: number }>('/api/admin/institutions/merge', {
      method: 'POST', body: JSON.stringify({ from: merging.from.code, into: merging.into.code }),
    });
    setBusy(false);
    if (!res.ok) { setError(res.error.message); return; }
    const n = res.data.records;
    setNotice(`${merging.from.name} merged into ${merging.into.name}: ${n} ${n === 1 ? 'record' : 'records'} updated`
      + `${res.data.keyClashes ? `, ${res.data.keyClashes} kept their old duplicate check because the new one would clash` : ''}.`);
    setMerging(null);
    await load();
  }

  return (
    <div className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <Card padded={false}>
        <CardHeader
          title="Added organisations"
          subtitle={`The directory holds ${total.toLocaleString('en-IN')} approved organisations. People can use one they add at once; approve it, or merge it into the entry it duplicates.`}
          actions={<Button variant="secondary" onClick={() => setAdding((a) => !a)}><IconPlus />Add one</Button>}
        />
        {adding ? (
          <div className="border-b border-line p-4">
            <AddInstitute
              initialName=""
              onCancel={() => setAdding(false)}
              onAdded={(hit) => { setAdding(false); setNotice(`${hit.name} added (${hit.code}).`); void load(); }}
            />
          </div>
        ) : null}
        {pending === null ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">Nothing is waiting for review.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th><Th>Kind</Th><Th>Country</Th><Th>Added by</Th><Th className="w-20 text-right">Records</Th><Th className="w-52 text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.code}>
                  <Td>
                    <span className="block font-medium">{p.name}</span>
                    <span className="block font-mono text-2xs text-ink-muted">{p.code}</span>
                  </Td>
                  <Td>{p.kind ?? '—'}</Td>
                  <Td>{[p.city, p.state, p.country].filter(Boolean).join(', ')}</Td>
                  <Td>{p.addedBy ?? '—'}</Td>
                  <Td className="text-right font-mono tabular-nums">{p.records}</Td>
                  <Td className="text-right">
                    <Button className="min-h-7 px-2 py-1 text-xs" disabled={busy} onClick={() => void approve(p)}>Approve</Button>
                    <Button variant="ghost" className="min-h-7 px-2 py-1 text-xs" disabled={busy} onClick={() => setMerging({ from: p, into: null })}>Merge into…</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={!!merging}
        title={merging ? `Merge “${merging.from.name}”` : 'Merge'}
        confirmLabel="Merge"
        stayLabel="Cancel"
        danger={false}
        busy={busy}
        confirmDisabled={!merging?.into}
        onConfirm={() => void merge()}
        onCancel={() => setMerging(null)}
      >
        {merging ? (
          <div className="space-y-3 text-sm">
            <p>
              Every record that names this organisation ({merging.from.records} now) will name the one you choose instead,
              and this entry will be retired. This cannot be undone from here.
            </p>
            <InstitutionPicker
              id="merge-into"
              name={merging.into ? merging.into.name : ''}
              code={merging.into ? merging.into.code : ''}
              disabled={false}
              invalid={false}
              excludeHome
              allowAdd={false}
              onPick={(hit) => setMerging((m) => (m ? { ...m, into: hit } : m))}
              onClear={() => setMerging((m) => (m ? { ...m, into: null } : m))}
            />
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
