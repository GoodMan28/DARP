'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { cx } from '@/lib/cx';
import { Button, Card, CardHeader, Input, Notice, Table, Td, Th } from '@/components/ui';
import { IconPlus } from '@/components/shell/Icon';

interface DepartmentRow { id: string; code: string; name: string; isActive: boolean; people: number }

/** BIT's departments, for IQAC to keep. Renaming changes the name people see; it does not move anyone. */
export function DepartmentsPanel() {
  const [rows, setRows] = useState<DepartmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    const res = await apiJson<{ departments: DepartmentRow[] }>('/api/admin/departments');
    if (!res.ok) { setError(res.error.message); return; }
    setRows(res.data.departments);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function call(method: 'POST' | 'PATCH', body: unknown) {
    setBusy(true);
    setError(null);
    const res = await apiJson('/api/admin/departments', { method, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) { setError(res.error.fields?.code ?? res.error.message); return false; }
    await load();
    return true;
  }

  return (
    <div className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Card padded={false}>
        <CardHeader title="Departments" subtitle="Add a department, rename one, or switch one off. A department with people in it cannot be switched off." />
        <div className="flex flex-wrap items-end gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
          <label className="text-xs font-semibold text-ink">
            <span className="mb-1 block">Code</span>
            <Input className="w-28 uppercase" value={code} maxLength={8} placeholder="CSE" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </label>
          <label className="flex-1 text-xs font-semibold text-ink">
            <span className="mb-1 block">Full name</span>
            <Input className="max-w-md" value={name} placeholder="Computer Science and Engineering" onChange={(e) => setName(e.target.value)} />
          </label>
          <Button disabled={busy || code.length < 2 || name.trim().length < 3}
            onClick={() => void call('POST', { code, name }).then((ok) => { if (ok) { setCode(''); setName(''); } })}>
            <IconPlus />Add
          </Button>
        </div>
        {rows === null ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">Loading…</p>
        ) : (
          <Table>
            <thead>
              <tr><Th className="w-24">Code</Th><Th>Name</Th><Th className="w-24 text-right">People</Th><Th className="w-28">Status</Th><Th className="w-44 text-right">Actions</Th></tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className={cx(!d.isActive && 'bg-surface-inset')}>
                  <Td className="font-mono text-xs">{d.code}</Td>
                  <Td className={cx('font-medium', !d.isActive && 'text-ink-muted line-through')}>
                    {editing?.id === d.id ? (
                      <Input aria-label={`Name of ${d.code}`} value={editing.name} onChange={(e) => setEditing({ id: d.id, name: e.target.value })} />
                    ) : d.name}
                  </Td>
                  <Td className="text-right font-mono tabular-nums">{d.people}</Td>
                  <Td>{d.isActive ? 'Active' : 'Hidden'}</Td>
                  <Td className="text-right">
                    {editing?.id === d.id ? (
                      <>
                        <Button className="min-h-7 px-2 py-1 text-xs" disabled={busy || editing.name.trim().length < 3}
                          onClick={() => void call('PATCH', { id: d.id, name: editing.name }).then((ok) => { if (ok) setEditing(null); })}>Save</Button>
                        <Button variant="ghost" className="min-h-7 px-2 py-1 text-xs" onClick={() => setEditing(null)}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" className="min-h-7 px-2 py-1 text-xs" onClick={() => setEditing({ id: d.id, name: d.name })}>Rename</Button>
                        <Button variant="ghost" className={cx('min-h-7 px-2 py-1 text-xs', d.isActive && 'text-danger-700')} disabled={busy}
                          onClick={() => void call('PATCH', { id: d.id, isActive: !d.isActive })}>
                          {d.isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
