'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Button, Card, CardHeader, EmptyState, Field, Input, Notice, Table, Td, Th } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { RangeRow, RangesPayload } from './types';

/**
 * Saved year ranges: a name plus a first and last year. The one marked default is what profiles and
 * reports start with. A range never hides a record: every year stays visible to the people allowed to see it.
 */
export function CyclePanel() {
  const [ranges, setRanges] = useState<RangeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', from: '', to: '' });
  const [removing, setRemoving] = useState<RangeRow | null>(null);

  const load = useCallback(async () => {
    const res = await apiJson<RangesPayload>('/api/admin/cycles');
    if (res.ok) { setRanges(res.data.ranges); setError(null); } else setError(res.error.message);
  }, []);
  useEffect(() => { void load(); }, [load]);

  function startEdit(r: RangeRow | null) {
    setEditing(r ? r.id : 'new');
    const now = new Date().getFullYear();
    setForm(r ? { name: r.name, from: String(r.from), to: String(r.to) } : { name: '', from: String(now - 2), to: String(now) });
    setNote(null);
  }

  async function save() {
    setBusy(true);
    const body = { name: form.name.trim(), from: Number(form.from), to: Number(form.to) };
    const res = editing === 'new'
      ? await apiJson('/api/admin/cycles', { method: 'POST', body: JSON.stringify(body) })
      : await apiJson('/api/admin/cycles', { method: 'PATCH', body: JSON.stringify({ id: editing, ...body }) });
    setBusy(false);
    if (!res.ok) { setNote({ tone: 'danger', text: res.error.message }); return; }
    setEditing(null);
    setNote({ tone: 'success', text: 'Saved.' });
    await load();
  }

  async function makeDefault(r: RangeRow) {
    setBusy(true);
    const res = await apiJson('/api/admin/cycles', { method: 'PATCH', body: JSON.stringify({ id: r.id, makeDefault: true }) });
    setBusy(false);
    setNote(res.ok ? { tone: 'success', text: `“${r.name}” is now the default.` } : { tone: 'danger', text: res.error.message });
    await load();
  }

  async function remove(r: RangeRow) {
    setRemoving(null);
    setBusy(true);
    const res = await apiJson('/api/admin/cycles', { method: 'DELETE', body: JSON.stringify({ id: r.id }) });
    setBusy(false);
    setNote(res.ok ? { tone: 'success', text: `“${r.name}” was removed. No record changed.` } : { tone: 'danger', text: res.error.message });
    await load();
  }

  if (error) return <Notice tone="danger" title="Year ranges could not be loaded">{error}</Notice>;
  if (!ranges) return <p className="text-sm text-ink-muted">Loading…</p>;

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

  return (
    <div className="space-y-4">
      <Notice tone="info">
        A year range is a name and a first and last year, for example “NAAC Cycle 4” 2022 to 2024. The default range is what
        “My numbers” on each person’s Overview page and the reports start with. It never hides a record, and a person can pick other years at any time.
        If no range is marked default, the last three calendar years are used.
      </Notice>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      <Card padded={false}>
        <CardHeader
          title="Year ranges"
          actions={<Button type="button" variant="secondary" disabled={busy} onClick={() => startEdit(null)}>Add a range</Button>}
        />
        {editing ? (
          <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <Field label="Name" htmlFor="r-name">
              <Input id="r-name" value={form.name} maxLength={160} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="First year" htmlFor="r-from">
              <Input id="r-from" inputMode="numeric" value={form.from} onChange={(e) => setForm({ ...form, from: digits(e.target.value) })} />
            </Field>
            <Field label="Last year" htmlFor="r-to">
              <Input id="r-to" inputMode="numeric" value={form.to} onChange={(e) => setForm({ ...form, to: digits(e.target.value) })} />
            </Field>
            <div className="flex items-end gap-2">
              <Button type="button" disabled={busy || form.name.trim().length < 3} onClick={() => void save()}>Save</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        ) : null}
        {ranges.length === 0 ? (
          <EmptyState title="No saved ranges">The last three calendar years are used until you add one.</EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Name</Th><Th>Years</Th><Th>&nbsp;</Th><Th className="text-right">&nbsp;</Th></tr></thead>
            <tbody>
              {ranges.map((r) => (
                <tr key={r.id}>
                  <Td className="font-semibold">{r.name}</Td>
                  <Td>{r.from === r.to ? r.from : `${r.from} to ${r.to}`}</Td>
                  <Td>
                    {r.isDefault ? (
                      <span className="rounded-sm border border-success-100 bg-success-50 px-1.5 py-0.5 text-xs font-semibold text-success-700">Default</span>
                    ) : null}
                  </Td>
                  <Td className="text-right">
                    <span className="inline-flex flex-wrap justify-end gap-1">
                      {!r.isDefault ? <Button type="button" variant="secondary" disabled={busy} onClick={() => void makeDefault(r)}>Make default</Button> : null}
                      <Button type="button" variant="ghost" disabled={busy} onClick={() => startEdit(r)}>Edit</Button>
                      <Button type="button" variant="ghost" disabled={busy} onClick={() => setRemoving(r)}>Delete</Button>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Delete “${removing.name}”?` : ''}
        stayLabel="Keep it"
        confirmLabel="Delete"
        onConfirm={() => removing && void remove(removing)}
        onCancel={() => setRemoving(null)}
      >
        Only the saved range is removed. No record changes.
      </ConfirmDialog>
    </div>
  );
}
