'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, apiJson } from '@/lib/csrf-client';
import {
  Field, Input, Select, Textarea, Checkbox, FileInput, Button, Card, Notice,
} from '@/components/ui';
import { LOOKUP_SOURCE_LABEL, type FormFieldDef, type LookupFillPayload } from '@darp/shared/contracts';

export type { FormFieldDef } from '@darp/shared/contracts';

interface Props {
  moduleKey: string;
  fields: FormFieldDef[];
  recordId?: string;
  initialValues?: Record<string, unknown>;
  locked: { period: string; department: string; enteredBy: string };
  readOnly?: boolean;
  /** Present when the module fetches its facts from a register (DOI / ISBN). */
  lookup?: { kind: string; idFields: string[]; idLabel: string } | null;
  /** Fields locked when the form opens (an existing auto-checked record). */
  initialLocked?: string[];
}

export function RecordForm({
  moduleKey, fields, recordId, initialValues, locked, readOnly, lookup, initialLocked,
}: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(initialValues ?? {});
  const [lockedKeys, setLockedKeys] = useState<Set<string>>(() => new Set(initialLocked ?? []));
  const [identifier, setIdentifier] = useState<string>(
    () => (lookup?.idFields.map((k) => String(initialValues?.[k] ?? '')).find(Boolean)) ?? '',
  );
  const [fetching, setFetching] = useState(false);
  const [lookupNote, setLookupNote] = useState<
    { tone: 'success' | 'info' | 'warning'; title: string; notes: string[] } | null
  >(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const errorSummary = useRef<HTMLDivElement>(null);

  /* Warn before losing typed data. */
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const visible = useCallback(
    (f: FormFieldDef) => !f.showIf || f.showIf.in.includes(String(values[f.showIf.field] ?? '')),
    [values],
  );

  const sections = useMemo(() => {
    const map = new Map<string, FormFieldDef[]>();
    for (const f of fields) {
      const s = f.section ?? 'Details';
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(f);
    }
    return [...map.entries()];
  }, [fields]);

  function set(key: string, value: unknown) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => { const rest = { ...e }; delete rest[key]; return rest; });
    setDirty(true);
  }

  async function fetchDetails() {
    if (!lookup || !identifier.trim()) return;
    setFetching(true);
    setLookupNote(null);
    const res = await apiJson<LookupFillPayload>(`/api/lookup/${moduleKey}`, {
      method: 'POST',
      body: JSON.stringify({ identifier: identifier.trim() }),
    });
    setFetching(false);
    if (!res.ok) {
      setLookupNote({ tone: 'warning', title: res.error.message, notes: [] });
      return;
    }
    const p = res.data;
    setValues((v) => ({ ...v, ...p.fill }));
    setLockedKeys(new Set(p.locked));
    setDirty(true);
    const source = p.source ? LOOKUP_SOURCE_LABEL[p.source] : '';
    setLookupNote(
      !p.found
        ? { tone: 'warning', title: 'No published record found', notes: p.notes }
        : p.authoritative
          ? { tone: 'success', title: `Details fetched from ${source}`, notes: p.notes }
          : { tone: 'info', title: `Suggested details from ${source} — check every field`, notes: p.notes },
    );
  }

  async function save(mode: 'draft' | 'submit') {
    setBusy(true);
    setBanner(null);
    // Conditional fields that are hidden must not be sent.
    const payload: Record<string, unknown> = {};
    for (const f of fields) if (visible(f)) payload[f.key] = values[f.key] ?? '';

    const url = recordId
      ? `/api/modules/${moduleKey}/records/${recordId}`
      : `/api/modules/${moduleKey}/records`;
    const res = await apiFetch(url, {
      method: recordId ? 'PATCH' : 'POST',
      body: JSON.stringify({ values: payload, mode }),
    });
    const json = await res.json();
    setBusy(false);

    if (!json.ok) {
      setErrors(json.error.fields ?? {});
      setBanner(json.error.message);
      errorSummary.current?.focus();
      return;                            // values stay on screen — nothing typed is ever lost
    }
    setDirty(false);
    window.location.href = `/m/${moduleKey}?saved=1`;
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save('submit'); }} noValidate>
      {banner ? (
        <div ref={errorSummary} tabIndex={-1} className="mb-4">
          <Notice tone="danger" title={banner}>
            {Object.keys(errors).length > 0 ? (
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(errors).map(([k, msg]) => (
                  <li key={k}>
                    <a href={`#f-${k}`} className="underline">
                      {fields.find((f) => f.key === k)?.label ?? k}: {msg}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </Notice>
        </div>
      ) : null}

      <Card className="mb-4 bg-surface-2">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <span className="text-2xs font-bold uppercase tracking-wider text-ink-faint">Reporting period</span>
            <div className="font-semibold">{locked.period}</div>
          </div>
          <div>
            <span className="text-2xs font-bold uppercase tracking-wider text-ink-faint">Department</span>
            <div className="font-semibold">{locked.department}</div>
          </div>
          <div>
            <span className="text-2xs font-bold uppercase tracking-wider text-ink-faint">Entered by</span>
            <div className="font-semibold">{locked.enteredBy}</div>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Pre-filled from your account and locked — this is how records are attributed without anyone
          re-typing them.
        </p>
      </Card>

      {lookup && !readOnly ? (
        <Card className="mb-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64 flex-1">
              <Field
                label={lookup.idLabel}
                htmlFor="lookup-identifier"
                help="Paste it and press Fetch details. Fields marked “Fetched · locked” come from the publisher's record and cannot be changed."
              >
                <Input
                  id="lookup-identifier"
                  value={identifier}
                  onChange={(e) => { setIdentifier(e.target.value); setLockedKeys(new Set()); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void fetchDetails(); } }}
                />
              </Field>
            </div>
            <Button type="button" variant="secondary" disabled={fetching || !identifier.trim()} onClick={() => void fetchDetails()}>
              {fetching ? 'Fetching…' : 'Fetch details'}
            </Button>
          </div>
          {lookupNote ? (
            <Notice tone={lookupNote.tone} title={lookupNote.title} className="mt-3">
              {lookupNote.notes.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {lookupNote.notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              ) : null}
            </Notice>
          ) : null}
        </Card>
      ) : null}

      {sections.map(([section, sectionFields]) => {
        const shown = sectionFields.filter(visible);
        if (shown.length === 0) return null;
        return (
          <Card key={section} className="mb-4" padded={false}>
            <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">{section}</h2>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              {shown.map((f) => (
                <div key={f.key} className={f.colSpan === 2 ? 'sm:col-span-2' : ''} id={`f-${f.key}`}>
                  <Field
                    label={f.label}
                    required={f.required}
                    help={f.help}
                    error={errors[f.key]}
                    htmlFor={`i-${f.key}`}
                    hint={lockedKeys.has(f.key) ? 'Fetched · locked' : f.protected ? 'Protected' : undefined}
                  >
                    {renderInput(f, values[f.key], (v) => set(f.key, v), !!readOnly || lockedKeys.has(f.key), !!errors[f.key])}
                  </Field>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {!readOnly ? (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-line bg-canvas py-3">
          <Button type="button" variant="ghost" onClick={() => history.back()}>Cancel</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void save('draft')}>
            Save as draft
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save and submit'}
          </Button>
          <p className="ml-auto text-xs text-ink-muted">
            Saving updates your profile totals and the department roll-up.
          </p>
        </div>
      ) : null}
    </form>
  );
}

function renderInput(
  f: FormFieldDef, value: unknown, onChange: (v: unknown) => void, readOnly: boolean, invalid: boolean,
) {
  const common = { id: `i-${f.key}`, disabled: readOnly, 'aria-invalid': invalid || undefined };
  switch (f.type) {
    case 'textarea':
      return (
        <Textarea
          {...common}
          value={String(value ?? '')}
          maxLength={f.maxLength ?? undefined}
          placeholder={f.placeholder ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'select':
      return (
        <Select {...common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      );
    case 'multiselect':
      return (
        <div className="space-y-1.5">
          {f.options.map((o) => {
            const arr = Array.isArray(value) ? (value as string[]) : [];
            return (
              <label key={o} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={arr.includes(o)}
                  disabled={readOnly}
                  onChange={(e) => onChange(
                    e.target.checked ? [...arr, o] : arr.filter((v) => v !== o),
                  )}
                />
                {o}
              </label>
            );
          })}
        </div>
      );
    case 'checkbox':
      return <Checkbox {...common} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
    case 'file':
      return (
        <FileInput
          id={`i-${f.key}`}
          disabled={readOnly}
          accept={f.accept}
          maxSizeMB={f.maxSizeMB ?? 5}
          value={String(value ?? '')}
          onUploaded={(id) => onChange(id)}
        />
      );
    case 'date':
      return (
        <Input {...common} type="date" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      );
    case 'integer':
    case 'year':
      return (
        <Input
          {...common}
          inputMode="numeric"
          value={String(value ?? '')}
          placeholder={f.placeholder ?? ''}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        />
      );
    case 'money':
      return (
        <Input
          {...common}
          inputMode="numeric"
          value={String(value ?? '')}
          placeholder={f.placeholder ?? '4820000'}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        />
      );
    case 'aadhaar':
      return (
        <Input
          {...common}
          inputMode="numeric"
          maxLength={12}
          autoComplete="off"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        />
      );
    default:
      return (
        <Input
          {...common}
          value={String(value ?? '')}
          maxLength={f.maxLength ?? undefined}
          placeholder={f.placeholder ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
