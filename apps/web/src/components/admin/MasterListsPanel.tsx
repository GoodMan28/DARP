'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { cx } from '@/lib/cx';
import {
  Button, Card, CardHeader, EmptyState, Input, Notice, Select, Table, Td, Th,
} from '@/components/ui';
import { IconPlus, IconSortAsc, IconSortDesc } from '@/components/shell/Icon';
import type { MasterListGroup, MasterListsPayload } from './types';

export function MasterListsPanel() {
  const [groups, setGroups] = useState<MasterListGroup[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newValue, setNewValue] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await apiJson<MasterListsPayload>('/api/admin/master-lists');
    if (!res.ok) { setLoadError(res.error.message); return; }
    setGroups(res.data.lists);
    setSelected((prev) => (prev && res.data.lists.some((l) => l.listKey === prev)
      ? prev
      : res.data.lists[0]?.listKey ?? ''));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const group = useMemo(
    () => groups?.find((g) => g.listKey === selected) ?? null,
    [groups, selected],
  );

  async function addValue() {
    if (!group || !newValue.trim()) return;
    setBusy(true);
    setActionError(null);
    const res = await apiJson('/api/admin/master-lists', {
      method: 'POST',
      body: JSON.stringify({ listKey: group.listKey, value: newValue.trim() }),
    });
    setBusy(false);
    if (!res.ok) { setActionError(res.error.message); return; }
    setNewValue('');
    await load();
  }

  async function setActive(id: string, next: boolean) {
    setBusy(true);
    setActionError(null);
    const res = await apiJson('/api/admin/master-lists', {
      method: 'PATCH',
      body: JSON.stringify({ action: next ? 'activate' : 'deactivate', id }),
    });
    setBusy(false);
    if (!res.ok) { setActionError(res.error.message); return; }
    await load();
  }

  async function move(index: number, delta: -1 | 1) {
    if (!group) return;
    const ids = group.items.map((i) => i.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    const a = ids[index]!;
    ids[index] = ids[target]!;
    ids[target] = a;

    setBusy(true);
    setActionError(null);
    const res = await apiJson('/api/admin/master-lists', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'reorder', listKey: group.listKey, orderedIds: ids }),
    });
    setBusy(false);
    if (!res.ok) { setActionError(res.error.message); return; }
    await load();
  }

  return (
    <div className="space-y-3">
      {loadError ? <Notice tone="danger" title="Lists could not be loaded">{loadError}</Notice> : null}
      {actionError ? <Notice tone="danger">{actionError}</Notice> : null}

      <Card padded={false}>
        <CardHeader
          title="Master lists"
          subtitle="The dropdowns every module reads. Values are deactivated, never deleted — records already reference them."
        />

        <div className="flex flex-wrap items-end gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
          <label className="text-xs font-semibold text-ink">
            <span className="mb-1 block">List</span>
            <Select className="w-72" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {(groups ?? []).map((g) => (
                <option key={g.listKey} value={g.listKey}>
                  {g.listKey} ({g.items.filter((i) => i.isActive).length})
                </option>
              ))}
            </Select>
          </label>
          <label className="flex-1 text-xs font-semibold text-ink">
            <span className="mb-1 block">Add a value</span>
            <div className="flex gap-2">
              <Input
                className="max-w-md"
                value={newValue}
                placeholder="Exactly as it should appear in the workbook"
                disabled={!group || busy}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addValue(); } }}
              />
              <Button disabled={!group || busy || !newValue.trim()} onClick={() => void addValue()}>
                <IconPlus />Add
              </Button>
            </div>
          </label>
        </div>

        {group ? (
          <>
            <div className="border-b border-line px-4 py-2 text-xs text-ink-muted">
              {group.usedBy.length > 0
                ? <>Used by: <span className="text-ink">{group.usedBy.join(' · ')}</span></>
                : 'No module currently references this list.'}
            </div>

            {group.items.length === 0 ? (
              <EmptyState title="This list is empty">
                Add the values exactly as the accreditation workbook words them.
              </EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th className="w-12">#</Th>
                    <Th>Value</Th>
                    <Th className="w-28">Status</Th>
                    <Th className="w-40 text-right">Order</Th>
                    <Th className="w-28 text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item, index) => (
                    <tr key={item.id} className={cx(!item.isActive && 'bg-surface-inset')}>
                      <Td className="font-mono text-2xs text-ink-faint">{item.sortOrder}</Td>
                      <Td className={cx('font-medium', !item.isActive && 'text-ink-muted line-through')}>
                        {item.value}
                      </Td>
                      <Td>
                        <span
                          className={cx(
                            'inline-flex items-center rounded-xs border px-1.5 py-0.5 text-2xs font-semibold',
                            item.isActive
                              ? 'border-success-100 bg-success-50 text-success-700'
                              : 'border-line-strong bg-surface-inset text-ink-muted',
                          )}
                        >
                          {item.isActive ? 'Active' : 'Hidden'}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            variant="ghost"
                            className="min-h-7 px-2 py-1"
                            aria-label={`Move ${item.value} up`}
                            disabled={busy || index === 0}
                            onClick={() => void move(index, -1)}
                          >
                            <IconSortAsc width={12} height={12} />
                          </Button>
                          <Button
                            variant="ghost"
                            className="min-h-7 px-2 py-1"
                            aria-label={`Move ${item.value} down`}
                            disabled={busy || index === group.items.length - 1}
                            onClick={() => void move(index, 1)}
                          >
                            <IconSortDesc width={12} height={12} />
                          </Button>
                        </div>
                      </Td>
                      <Td className="text-right">
                        <Button
                          variant="ghost"
                          className={cx('min-h-7 px-2 py-1 text-xs', item.isActive && 'text-danger-700')}
                          disabled={busy}
                          onClick={() => void setActive(item.id, !item.isActive)}
                        >
                          {item.isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">Loading lists…</p>
        )}
      </Card>

      <p className="text-xs text-ink-muted">
        Some module rules compare against these strings character for character. Editing a value that
        a rule depends on changes the rule’s behaviour; add a new value rather than rewording an old one.
      </p>
    </div>
  );
}
