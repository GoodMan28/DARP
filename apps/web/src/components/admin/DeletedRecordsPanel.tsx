'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { formatDateTime } from '@darp/shared/format';
import { Button, Card, CardHeader, EmptyState, Notice, Table, Td, Th, StatePill } from '@/components/ui';

interface Row {
  id: string; moduleKey: string; moduleName: string; title: string; ownerName: string;
  deletedAt: string; deletedByName: string; reason: string | null; status: string;
}

/** Deleted records, with who removed them and why; IQAC can bring one back. */
export function DeletedRecordsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await apiJson<Row[]>('/api/admin/deleted-records');
    if (res.ok) { setRows(res.data); setError(null); } else setError(res.error.message);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function restore(id: string) {
    setBusy(id);
    const res = await apiJson('/api/admin/deleted-records', { method: 'POST', body: JSON.stringify({ id }) });
    setBusy(null);
    setNote(res.ok ? { tone: 'success', text: 'The record is back in its owner’s list.' } : { tone: 'danger', text: res.error.message });
    await load();
  }

  if (error) return <Notice tone="danger" title="Deleted records could not be loaded">{error}</Notice>;
  if (!rows) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <Card padded={false}>
      <CardHeader title="Deleted records" subtitle="Removed from lists, totals and exports. Restore brings one back with the status it had." />
      {note ? <div className="p-3"><Notice tone={note.tone}>{note.text}</Notice></div> : null}
      {rows.length === 0 ? (
        <EmptyState title="Nothing has been deleted" />
      ) : (
        <Table>
          <thead>
            <tr><Th>Record</Th><Th>Owner</Th><Th>Deleted</Th><Th>Reason</Th><Th className="text-right">&nbsp;</Th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>
                  <span className="font-semibold">{r.title}</span>
                  <span className="block text-xs text-ink-muted">{r.moduleName} · <StatePill status={r.status} /></span>
                </Td>
                <Td>{r.ownerName}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(r.deletedAt)}<span className="block text-xs text-ink-muted">by {r.deletedByName}</span></Td>
                <Td>{r.reason ?? <span className="text-ink-muted">No reason (a draft)</span>}</Td>
                <Td className="text-right">
                  <Button type="button" variant="secondary" disabled={busy === r.id} onClick={() => void restore(r.id)}>
                    {busy === r.id ? 'Restoring…' : 'Restore'}
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
