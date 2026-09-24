'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { cx } from '@/lib/cx';
import { ROLE_SHORT } from '@/lib/roles';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, Notice, Select, Table, Td, Th,
} from '@/components/ui';
import { IconPlus, IconSearch } from '@/components/shell/Icon';
import type { Role } from '@/modules/_types';
import type {
  AdminUserRow, CreatedUserPayload, DepartmentRow, ResetPayload, UsersPayload,
} from './types';

const ROLES: readonly Role[] = ['faculty', 'hod', 'dofa', 'drie', 'dugs', 'cdc', 'admin'];
const DEPARTMENT_REQUIRED: readonly Role[] = ['faculty', 'hod'];

interface FormState {
  name: string;
  email: string;
  role: Role;
  departmentId: string;
  employeeId: string;
  dateOfJoining: string;
}

const EMPTY_FORM: FormState = {
  name: '', email: '', role: 'faculty', departmentId: '', employeeId: '', dateOfJoining: '',
};

export function AccountsPanel({ currentUserId }: { currentUserId: string }) {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [inactiveOnly, setInactiveOnly] = useState(false);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; email: string; password: string; kind: 'created' | 'reset' } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await apiJson<UsersPayload>('/api/admin/users');
    if (!res.ok) { setLoadError(res.error.message); return; }
    setRows(res.data.users);
    setDepartments(res.data.departments);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const departmentOptions = useMemo(
    () => departments.filter((d) => d.isActive || d.id === form.departmentId),
    [departments, form.departmentId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (inactiveOnly && u.isActive) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q)
        || u.email.toLowerCase().includes(q)
        || (u.departmentCode ?? '').toLowerCase().includes(q)
        || (u.employeeId ?? '').toLowerCase().includes(q);
    });
  }, [rows, query, roleFilter, inactiveOnly]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function startEdit(u: AdminUserRow) {
    setEditingId(u.id);
    setForm({
      name: u.name,
      email: u.email,
      role: u.role,
      departmentId: u.departmentId ?? '',
      employeeId: u.employeeId ?? '',
      dateOfJoining: u.dateOfJoining ?? '',
    });
    setFieldErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
  }

  const needsDepartment = DEPARTMENT_REQUIRED.includes(form.role);

  async function submitForm() {
    setBusy(true);
    setFieldErrors({});
    setFormError(null);

    // Checked here for a fast answer; the server enforces the same rule.
    if (needsDepartment && !form.departmentId) {
      setFieldErrors({ departmentId: 'Choose the department this account belongs to.' });
      setBusy(false);
      return;
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      departmentId: form.departmentId || null,
      employeeId: form.employeeId.trim() || null,
      dateOfJoining: form.dateOfJoining || null,
    };

    const res = editingId
      ? await apiJson<{ user: AdminUserRow }>(`/api/admin/users/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'update', ...payload }),
      })
      : await apiJson<CreatedUserPayload>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

    setBusy(false);

    if (!res.ok) {
      setFieldErrors(res.error.fields ?? {});
      setFormError(res.error.fields ? null : res.error.message);
      return;
    }

    if (!editingId && 'temporaryPassword' in res.data) {
      setIssued({
        name: res.data.user.name,
        email: res.data.user.email,
        password: res.data.temporaryPassword,
        kind: 'created',
      });
    }
    closeForm();
    await load();
  }

  async function act(u: AdminUserRow, action: 'deactivate' | 'activate' | 'resetPassword') {
    setRowError(null);
    setRowBusyId(u.id);
    const res = await apiJson<ResetPayload>(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    });
    setRowBusyId(null);
    if (!res.ok) { setRowError(res.error.message); return; }
    if (action === 'resetPassword' && res.data.temporaryPassword) {
      setIssued({ name: u.name, email: u.email, password: res.data.temporaryPassword, kind: 'reset' });
    }
    await load();
  }

  return (
    <div className="space-y-3">
      {issued ? (
        <Notice tone="warning" title={issued.kind === 'created' ? 'Temporary password issued' : 'Password reset'}>
          <p>
            Give this to <strong>{issued.name}</strong> ({issued.email}) over a channel you trust. It is
            shown once and is not recoverable — they must change it at first sign-in.
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-xs border border-line-strong bg-surface px-2 py-1 font-mono text-sm tracking-wide text-ink">
              {issued.password}
            </code>
            <Button variant="secondary" onClick={() => setIssued(null)}>Done</Button>
          </p>
        </Notice>
      ) : null}

      {loadError ? <Notice tone="danger" title="Accounts could not be loaded">{loadError}</Notice> : null}
      {rowError ? <Notice tone="danger">{rowError}</Notice> : null}

      {formOpen ? (
        <Card padded={false}>
          <CardHeader
            title={editingId ? 'Edit account' : 'New account'}
            subtitle={
              editingId
                ? 'Changing a role does not sign the person out. Deactivating does.'
                : 'DARP generates a strong temporary password and shows it once. There is no self-registration.'
            }
            actions={<Button variant="ghost" onClick={closeForm}>Cancel</Button>}
          />
          <div className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Full name" required error={fieldErrors.name} htmlFor="acc-name">
              <Input
                id="acc-name"
                value={form.name}
                autoComplete="off"
                aria-invalid={fieldErrors.name ? true : undefined}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Field label="Institute e-mail" required error={fieldErrors.email} htmlFor="acc-email">
              <Input
                id="acc-email"
                type="email"
                value={form.email}
                autoComplete="off"
                aria-invalid={fieldErrors.email ? true : undefined}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>

            <Field label="Role" required error={fieldErrors.role} htmlFor="acc-role">
              <Select
                id="acc-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              >
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_SHORT[r]}</option>)}
              </Select>
            </Field>

            <Field
              label="Department"
              required={needsDepartment}
              error={fieldErrors.departmentId}
              help={needsDepartment ? 'Required for faculty and HOD accounts.' : 'Optional for office roles.'}
              htmlFor="acc-dept"
            >
              <Select
                id="acc-dept"
                value={form.departmentId}
                aria-invalid={fieldErrors.departmentId ? true : undefined}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              >
                <option value="">— none —</option>
                {departmentOptions.map((d) => (
                  <option key={d.id} value={d.id}>{d.code} · {d.name}</option>
                ))}
              </Select>
            </Field>

            <Field label="Employee ID" error={fieldErrors.employeeId} htmlFor="acc-emp">
              <Input
                id="acc-emp"
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              />
            </Field>

            <Field
              label="Date of joining BIT"
              error={fieldErrors.dateOfJoining}
              help="Every “since joining BIT” counter needs it."
              htmlFor="acc-doj"
            >
              <Input
                id="acc-doj"
                type="date"
                value={form.dateOfJoining}
                onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })}
              />
            </Field>
          </div>
          {formError ? <div className="px-4 pb-3"><Notice tone="danger">{formError}</Notice></div> : null}
          <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
            <Button variant="secondary" onClick={closeForm}>Cancel</Button>
            <Button disabled={busy} onClick={() => void submitForm()}>
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Create account'}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card padded={false}>
        <CardHeader
          title="Accounts"
          subtitle={rows ? `${filtered.length} of ${rows.length} accounts` : 'Loading…'}
          actions={!formOpen ? (
            <Button onClick={startCreate}><IconPlus />New account</Button>
          ) : undefined}
        />

        <div className="flex flex-wrap items-end gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
          <label className="relative">
            <span className="sr-only">Search accounts</span>
            <IconSearch className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint" width={13} height={13} />
            <Input
              className="w-56 pl-7"
              placeholder="Name, e-mail, department"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-ink">
            <span className="sr-only">Filter by role</span>
            <Select className="w-40" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_SHORT[r]}</option>)}
            </Select>
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-xs font-semibold text-ink">
            <Checkbox checked={inactiveOnly} onChange={(e) => setInactiveOnly(e.target.checked)} />
            Deactivated only
          </label>
        </div>

        {rows === null ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">Loading accounts…</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="No accounts match">Clear the filters, or create the account.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>E-mail</Th>
                <Th>Role</Th>
                <Th>Department</Th>
                <Th>Joined</Th>
                <Th>Last sign-in</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className={cx(!u.isActive && 'bg-surface-inset')}>
                  <Td className="font-semibold">
                    {u.name}
                    {u.id === currentUserId ? <span className="ml-1.5 text-2xs font-normal text-ink-faint">(you)</span> : null}
                    {u.employeeId ? <div className="font-mono text-2xs text-ink-faint">{u.employeeId}</div> : null}
                  </Td>
                  <Td className="text-ink-muted">{u.email}</Td>
                  <Td>
                    <span className="inline-flex items-center rounded-xs border border-line-strong bg-surface-2 px-1.5 py-0.5 text-2xs font-semibold text-ink-muted">
                      {ROLE_SHORT[u.role]}
                    </span>
                  </Td>
                  <Td className="text-ink-muted">{u.departmentCode ?? '—'}</Td>
                  <Td className="tabular-nums text-ink-muted">{u.dateOfJoining ? formatDate(u.dateOfJoining) : '—'}</Td>
                  <Td className="tabular-nums text-ink-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <span
                        className={cx(
                          'inline-flex w-fit items-center rounded-xs border px-1.5 py-0.5 text-2xs font-semibold',
                          u.isActive
                            ? 'border-success-100 bg-success-50 text-success-700'
                            : 'border-line-strong bg-surface-inset text-ink-muted',
                        )}
                      >
                        {u.isActive ? 'Active' : 'Deactivated'}
                      </span>
                      {u.mustChangePassword ? (
                        <span className="text-2xs text-warning-700">Must change password</span>
                      ) : null}
                    </div>
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" className="min-h-7 px-2 py-1 text-xs" onClick={() => startEdit(u)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-7 px-2 py-1 text-xs"
                        disabled={rowBusyId === u.id}
                        onClick={() => void act(u, 'resetPassword')}
                      >
                        Reset password
                      </Button>
                      {u.isActive ? (
                        <Button
                          variant="ghost"
                          className="min-h-7 px-2 py-1 text-xs text-danger-700"
                          disabled={rowBusyId === u.id || u.id === currentUserId}
                          onClick={() => void act(u, 'deactivate')}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          className="min-h-7 px-2 py-1 text-xs"
                          disabled={rowBusyId === u.id}
                          onClick={() => void act(u, 'activate')}
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="text-xs text-ink-muted">
        Deactivating an account revokes every one of its sessions immediately. Resetting a password
        does the same and forces a change at the next sign-in. Both are written to the audit log.
      </p>
    </div>
  );
}
