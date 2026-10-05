'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { cx } from '@/lib/cx';
import { formatDateTime, truncate } from '@darp/shared/format';
import {
  Button, Card, CardHeader, EmptyState, Input, Notice, Select, Table, Td, Th,
} from '@/components/ui';
import type { AuditEntry, AuditPayload } from './types';

interface Filters {
  actorUserId: string;
  action: string;
  entity: string;
  entityId: string;
  from: string;
  to: string;
}

const EMPTY: Filters = { actorUserId: '', action: '', entity: '', entityId: '', from: '', to: '' };

/** A one-line summary of the JSON columns, without ever printing a whole payload. */
function summarise(entry: AuditEntry): string {
  const parts: string[] = [];
  const meta = entry.meta;
  if (meta && typeof meta === 'object') {
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      if (v === null || typeof v === 'object') continue;
      parts.push(`${k}: ${String(v)}`);
    }
  }
  return parts.length > 0 ? truncate(parts.join(' · '), 160) : '—';
}

function changedKeys(entry: AuditEntry): string {
  const before = entry.before && typeof entry.before === 'object' ? entry.before as Record<string, unknown> : null;
  const after = entry.after && typeof entry.after === 'object' ? entry.after as Record<string, unknown> : null;
  if (!before && !after) return '—';
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changed = [...keys].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
  return changed.length > 0 ? truncate(changed.join(', '), 80) : '—';
}

export function AuditPanel() {
  const [data, setData] = useState<AuditPayload | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (f: Filters, p: number) => {
    setBusy(true);
    setError(null);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) qs.set(k, v);
    qs.set('page', String(p));
    qs.set('pageSize', '50');
    const res = await apiJson<AuditPayload>(`/api/admin/audit?${qs.toString()}`);
    setBusy(false);
    if (!res.ok) { setError(res.error.message); return; }
    setData(res.data);
  }, []);

  useEffect(() => { void load(filters, page); }, [load, filters, page]);

  function update(patch: Partial<Filters>) {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  const actions = data?.filters.actions ?? [];
  const entities = data?.filters.entities ?? [];
  const actors = data?.filters.actors ?? [];

  return (
    <div className="space-y-3">
      {error ? <Notice tone="danger" title="The audit log could not be read">{error}</Notice> : null}

      <Card padded={false}>
        <CardHeader
          title="Audit log"
          subtitle="Append-only at the database level. Nothing here can be edited or removed, by anyone."
          actions={
            <Button variant="secondary" disabled={busy} onClick={() => { setFilters(EMPTY); setPage(1); }}>
              Clear filters
            </Button>
          }
        />

        <div className="grid gap-2 border-b border-line bg-surface-2 px-4 py-2.5 md:grid-cols-3 lg:grid-cols-6">
          <label className="text-xs font-semibold text-ink">
            <span className="mb-1 block">Actor</span>
            <Select value={filters.actorUserId} onChange={(e) => update({ actorUserId: e.target.value })}>
              <option value="">Anyone</option>
              {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </label>
          <label className="text-xs font-semibold text-ink">
            <span className="mb-1 block">Action</span>
            <Select value={filters.action} onChange={(e) => update({ action: e.target.value })}>
              <option value="">Any action</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </label>
          <label className="text-xs font-semibold text-ink">
            <span className="mb-1 block">Entity</span>
            <Select value={filters.entity} onChange={(e) => update({ entity: e.target.value })}>
              <option value="">Any entity</option>
              {entities.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
            </Select>
          </label>
          <label className="text-xs font-semibold text-ink">
            <span className="mb-1 block">Entity ID</span>
            <Input value={filters.entityId} placeholder="Exact id" onChange={(e) => update({ entityId: e.target.value })} />
          </label>
          <label className="text-xs font-semibold text-ink">
            <span className="mb-1 block">From</span>
            <Input type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} />
          </label>
          <label className="text-xs font-semibold text-ink">
            <span className="mb-1 block">To</span>
            <Input type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} />
          </label>
        </div>

        {data === null ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">Reading the log…</p>
        ) : data.entries.length === 0 ? (
          <EmptyState title="Nothing matches these filters">
            Widen the date range, or clear the filters.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-40">When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Changed</Th>
                <Th>Detail</Th>
                <Th className="w-28">IP</Th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id} className={cx(e.action === 'pii.reveal' && 'bg-warning-50')}>
                  <Td className="whitespace-nowrap font-mono text-2xs tabular-nums text-ink-muted">
                    {formatDateTime(e.at)}
                  </Td>
                  <Td>
                    {e.actorName ?? <span className="text-ink-faint">system</span>}
                    {e.actorRole ? <div className="text-2xs text-ink-faint">{e.actorRole}</div> : null}
                  </Td>
                  <Td>
                    <span
                      className={cx(
                        'inline-flex items-center rounded-xs border px-1.5 py-0.5 font-mono text-2xs font-semibold',
                        e.action === 'pii.reveal'
                          ? 'border-warning-100 bg-warning-50 text-warning-700'
                          : e.action.startsWith('auth.login.fail') || e.action === 'auth.locked'
                            ? 'border-danger-100 bg-danger-50 text-danger-700'
                            : 'border-line-strong bg-surface-2 text-ink-muted',
                      )}
                    >
                      {e.action}
                    </span>
                  </Td>
                  <Td className="text-ink-muted">
                    {e.entity}
                    {e.entityId ? <div className="font-mono text-2xs text-ink-faint">{truncate(e.entityId, 20)}</div> : null}
                  </Td>
                  <Td className="text-2xs text-ink-muted">{changedKeys(e)}</Td>
                  <Td className="text-2xs text-ink-muted">{summarise(e)}</Td>
                  <Td className="font-mono text-2xs text-ink-faint">{e.ip ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {data ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5">
            <p className="text-xs text-ink-muted">
              {data.total === 0
                ? 'No entries'
                : `Showing ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total}`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="min-h-8 px-2.5 py-1 text-xs"
                disabled={busy || data.page <= 1}
                onClick={() => setPage(data.page - 1)}
              >
                Previous
              </Button>
              <span className="text-xs tabular-nums text-ink-muted">Page {data.page} of {data.totalPages}</span>
              <Button
                variant="secondary"
                className="min-h-8 px-2.5 py-1 text-xs"
                disabled={busy || data.page >= data.totalPages}
                onClick={() => setPage(data.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <p className="text-xs text-ink-muted">
        Aadhaar and PAN values are redacted before they reach this table; a `pii.reveal` row records
        who asked, for which field, and the reason they typed.
      </p>
    </div>
  );
}
