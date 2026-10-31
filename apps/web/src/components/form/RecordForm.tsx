'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, apiJson } from '@/lib/csrf-client';
import {
  Field, Input, Select, Textarea, Checkbox, FileInput, Button, LinkButton, Card, Notice,
} from '@/components/ui';
import {
  LOOKUP_SOURCE_LABEL, type FieldProvenance, type FormFieldDef, type LookupFillPayload,
} from '@darp/shared/contracts';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SPAN_MODULES, spanText } from '@darp/shared/projectPeriod';
import { JournalRankingCard } from './JournalRankingCard';
import { InstitutionPicker } from './InstitutionPicker';
import { applyComputed, computeValue } from '@darp/shared/computed';
import { useLeaveGuard } from './useLeaveGuard';

export type { FormFieldDef } from '@darp/shared/contracts';

interface Props {
  moduleKey: string;
  fields: FormFieldDef[];
  recordId?: string;
  initialValues?: Record<string, unknown>;
  locked: { period: string; department: string; enteredBy: string };
  readOnly?: boolean;
  /** Present when the module fetches its facts from a register (DOI / ISBN / patent number). */
  lookup?: { kind: string; idFields: string[]; idLabel: string; sourceName: string } | null;
  /** Fields locked when the form opens (an existing auto-checked record). */
  initialLocked?: string[];
  /** An identifier handed over from another module's form ("Add it under …"): fetched on opening. */
  handedOver?: string;
  /** A saved record: the fields its owner changed from the publisher's record or typed by hand. */
  initialProvenance?: Record<string, FieldProvenance>;
  /** Show the journal's ranking, looked up from the ISSN field, after the section holding it. */
  showRanking?: boolean;
  /** The saved record is already approved: saving keeps it approved and records the change. */
  approved?: boolean;
  /** Dates worked out from a year (October 2026 change): shown with a request for the exact date. */
  estimatedDates?: string[];
  /** Values that could not be carried over and must be entered again. */
  needsInput?: string[];
  /** Opened from an upload of many records: saving goes back there instead of to the module list. */
  returnTo?: string;
}

/** The same text for this purpose: case and spacing aside (the server compares the same way). */
const sameText = (a: unknown, b: string) => (
  String(a ?? '').toLowerCase().replace(/\s+/g, ' ').trim() === b.toLowerCase().replace(/\s+/g, ' ').trim()
);

export function RecordForm({
  moduleKey, fields, recordId, initialValues, locked, readOnly, lookup, initialLocked, handedOver,
  initialProvenance, showRanking, approved, estimatedDates, needsInput, returnTo,
}: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(initialValues ?? {});
  /** The country of each institute chosen on this form, for the fields worked out from it (the server decides on saving). */
  const [instituteCountries, setInstituteCountries] = useState<Record<string, string>>({});
  const [lockedKeys, setLockedKeys] = useState<Set<string>>(() => new Set(initialLocked ?? []));
  /*
   * The publisher's value of each fetched field, so a change can be shown beside it and undone.
   * For a saved record: the locked fields hold it, and a changed field's is kept on the record.
   */
  const [fetchedValues, setFetchedValues] = useState<Record<string, string>>(() => {
    // A saved record was fetched from the publisher when a locked field is locked (or a change is recorded).
    const wasFetched = Object.keys(initialProvenance ?? {}).length > 0
      || (initialLocked ?? []).some((k) => fields.find((f) => f.key === k)?.autofill?.locked);
    const out: Record<string, string> = {};
    if (!wasFetched) return out;
    for (const f of fields) {
      if (!f.autofill || f.autofill.alwaysLocked || f.autofill.generated) continue;
      const p = initialProvenance?.[f.key];
      const value = String(initialValues?.[f.key] ?? '');
      // Changed: keep the publisher's value. Typed: nothing was fetched. Otherwise the saved value
      // is the publisher's — including fields that are not locked, such as the author list.
      if (p?.origin === 'changed') out[f.key] = p.fetched;
      else if (!p && value) out[f.key] = value;
    }
    return out;
  });
  /** A lookup has filled this form (now or when it was saved): unfetched fields were typed by hand. */
  const [looked, setLooked] = useState<boolean>(
    () => Object.keys(initialProvenance ?? {}).length > 0 || (initialLocked ?? []).some((k) => fields.find((f) => f.key === k)?.autofill?.locked),
  );
  /** The field whose Change warning is open. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState<string>(
    () => handedOver ?? (lookup?.idFields.map((k) => String(initialValues?.[k] ?? '')).find(Boolean)) ?? '',
  );
  /**
   * The identifier field the box above stands for: the only one (a patent number), or the DOI
   * field for a DOI and the ISBN field otherwise.
   */
  const mirrorKey = useMemo(() => {
    if (!lookup) return null;
    if (lookup.idFields.length === 1) return lookup.idFields[0]!;
    const wantDoi = !identifier.trim() || /^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)?10\.\d{4,9}\//i.test(identifier.trim());
    return lookup.idFields.find((k) => fields.find((f) => f.key === k)?.type === (wantDoi ? 'doi' : 'isbn')) ?? null;
  }, [lookup, identifier, fields]);
  const [fetching, setFetching] = useState(false);
  const [lookupNote, setLookupNote] = useState<{
    tone: 'success' | 'info' | 'warning'; title: string; notes: string[];
    moveTo?: LookupFillPayload['moveTo'];
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  /** A ref, so a save can clear it and navigate in the same tick without the browser asking. */
  const dirtyRef = useRef(false);
  const guard = useLeaveGuard(dirtyRef);
  const [banner, setBanner] = useState<string | null>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  /** "the publisher's record", "the Patent Office Journal" — and as a label, "Publisher's record". */
  const source = lookup?.sourceName ?? "the publisher's record";
  const sourceLabel = source.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase());

  /* An identifier handed over from another module's form is fetched straight away. */
  const handedOverFetched = useRef(false);
  useEffect(() => {
    if (handedOver && !handedOverFetched.current) {
      handedOverFetched.current = true;
      void fetchDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handedOver]);

  const visible = useCallback(
    (f: FormFieldDef) => {
      if (!f.showIf) return true;
      const v = String(values[f.showIf.field] ?? '');
      return f.showIf.in ? f.showIf.in.includes(v) : !!f.showIf.notIn && !f.showIf.notIn.includes(v);
    },
    [values],
  );

  /** Every figure the system works out, over what is typed so far: shown live, and replaced by the server on saving. */
  const shownValues = useMemo(
    () => applyComputed(fields, values, { institutes: new Map(Object.entries(instituteCountries).map(([c, country]) => [c, { country }])) }),
    [fields, values, instituteCountries],
  );

  const sections = useMemo(() => {
    const map = new Map<string, FormFieldDef[]>();
    for (const f of fields) {
      if (f.custom || f.hidden) continue;      // drawn inside the journal ranking card, or not on the form
      if (f.type === 'institutionCode') continue;      // chosen together with its institute
      const s = f.section ?? 'Details';
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(f);
    }
    return [...map.entries()];
  }, [fields]);

  function set(key: string, value: unknown) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => { const rest = { ...e }; delete rest[key]; return rest; });
    dirtyRef.current = true;
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
    // Only the publisher's own record counts as "fetched": suggestions are not something to change from.
    const fetchedNow: Record<string, string> = {};
    if (p.found && p.authoritative) {
      for (const f of fields) {
        if (!f.autofill || f.autofill.alwaysLocked || f.autofill.generated || f.key === mirrorKey) continue;
        if (p.fill[f.key]) fetchedNow[f.key] = p.fill[f.key]!;
      }
    }
    setFetchedValues(fetchedNow);
    setLooked(p.found && p.authoritative);
    setConfirming(null);
    dirtyRef.current = true;
    const from = p.source ? LOOKUP_SOURCE_LABEL[p.source] : '';
    setLookupNote(
      p.moveTo !== undefined
        ? {
          tone: 'warning',
          title: p.moveTo ? `This belongs under ${p.moveTo.name}` : 'This cannot be entered',
          notes: p.notes,
          moveTo: p.moveTo,
        }
        : !p.found
        ? { tone: 'warning', title: 'No published record found', notes: p.notes }
        : p.authoritative
          ? { tone: 'success', title: `Details fetched from ${from}`, notes: p.notes }
          : { tone: 'info', title: `Suggested details from ${from} — check every field`, notes: p.notes },
    );
  }

  async function save(mode: 'draft' | 'submit') {
    setBusy(true);
    setBanner(null);
    // Conditional fields that are hidden must not be sent.
    const payload: Record<string, unknown> = {};
    for (const f of fields) if (visible(f)) payload[f.key] = values[f.key] ?? '';
    // The identifier box is the record's DOI (or ISBN): it is what the server looks up.
    if (mirrorKey && identifier.trim()) payload[mirrorKey] = identifier.trim();

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
    dirtyRef.current = false;
    window.location.href = returnTo ?? `/m/${moduleKey}?saved=1`;
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save('submit'); }} noValidate>
      {banner ? (
        <div ref={errorSummary} tabIndex={-1} className="mb-4">
          <Notice tone="danger" title={banner}>
            {Object.keys(errors).length > 0 ? (
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(errors).filter(([, msg]) => msg !== banner).map(([k, msg]) => {
                  const label = fields.find((f) => f.key === k)?.label ?? k;
                  return (
                    <li key={k}>
                      <a href={`#f-${k}`} className="underline">
                        {/* "Evidence is required." already names the field: do not say it twice. */}
                        {msg.startsWith(label) ? msg : `${label}: ${msg}`}
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Notice>
        </div>
      ) : null}

      <Card className="mb-4 bg-surface-2">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <span className="text-xs font-semibold text-ink-muted">Counted in</span>
            <div className="font-semibold">{locked.period}</div>
          </div>
          <div>
            <span className="text-xs font-semibold text-ink-muted">Department</span>
            <div className="font-semibold">{locked.department}</div>
          </div>
          <div>
            <span className="text-xs font-semibold text-ink-muted">Entered by</span>
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
                help={`Paste it and press Fetch details. Fields marked “From ${source}” are filled in for you; if one is wrong, press Change beside it — DRIE and IQAC will see what you changed.`}
              >
                <Input
                  id="lookup-identifier"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    setLockedKeys(new Set());
                    setFetchedValues({});
                    setLooked(false);
                    setConfirming(null);
                  }}
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
              {lookupNote.moveTo ? (
                <LinkButton
                  href={`/m/${lookupNote.moveTo.moduleKey}/new?id=${encodeURIComponent(identifier.trim())}`}
                  variant="secondary"
                  className="mt-2"
                >
                  Add it under {lookupNote.moveTo.name}
                </LinkButton>
              ) : null}
            </Notice>
          ) : null}
        </Card>
      ) : null}

      {sections.map(([section, sectionFields]) => {
        const shown = sectionFields.filter(visible);
        if (shown.length === 0) return null;
        const rankingHere = showRanking && shown.some((f) => f.key === 'issn');
        return [
          <Card key={section} className="mb-4" padded={false}>
            <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">{section}</h2>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              {shown.map((f) => {
                const system = !!f.autofill?.alwaysLocked || !!f.autofill?.generated;
                // The field the identifier box fills is shown, not typed in a second time.
                const mirror = f.key === mirrorKey;
                const isLocked = lockedKeys.has(f.key);
                const fetched = fetchedValues[f.key];
                const changed = fetched !== undefined && !isLocked && !sameText(values[f.key], fetched);
                const typed = looked && !!f.autofill && !system && !mirror && fetched === undefined
                  && values[f.key] !== undefined && values[f.key] !== '';
                const mayChange = isLocked && !readOnly && !system && !mirror;
                // A figure the system works out from other fields: shown, never typed.
                const workedOut = !!f.computed && computeValue(f.computed, values) !== undefined;
                const hint = workedOut ? 'Worked out for you'
                  : mirror && !readOnly ? `From the ${lookup!.idLabel} box above`
                  : f.autofill?.alwaysLocked ? 'Filled automatically'
                  : f.autofill?.generated && isLocked ? 'Generated from the details'
                    : isLocked ? `From ${source}`
                      : changed ? 'Changed — DRIE and IQAC will see this'
                        : typed ? 'Entered by hand — DRIE and IQAC will see this'
                          : f.protected ? 'Protected' : undefined;
                return (
                  <div
                    key={f.key}
                    className={`${f.colSpan === 2 ? 'sm:col-span-2' : ''} ${changed || typed ? 'rounded-sm border border-warning-100 bg-warning-50 p-2' : ''}`}
                    id={`f-${f.key}`}
                  >
                    <Field
                      label={f.label}
                      required={f.required}
                      help={mirror && !readOnly ? null : f.help}
                      error={errors[f.key]}
                      htmlFor={`i-${f.key}`}
                      hint={hint}
                    >
                      {renderInput(
                        f, workedOut ? shownValues[f.key] : mirror && !readOnly ? identifier : values[f.key], (v) => set(f.key, v),
                        !!readOnly || workedOut || mirror || isLocked || !!f.autofill?.alwaysLocked, !!errors[f.key], { moduleKey, recordId, values, setField: set, rememberInstitute: (code, country) => setInstituteCountries((c) => ({ ...c, [code]: country })) },
                      )}
                      {mayChange && confirming !== f.key ? (
                        <button
                          type="button"
                          className="mt-1 text-xs font-semibold text-brand-700 underline"
                          onClick={() => setConfirming(f.key)}
                        >
                          Change
                        </button>
                      ) : null}
                      {mayChange && confirming === f.key ? (
                        <Notice tone="warning" title={`Change a detail from ${source}?`} className="mt-2">
                          DRIE and IQAC will see that you changed this, along with the value from {source}.
                          Attach evidence that shows the correct value.
                          <span className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                setLockedKeys((s) => { const next = new Set(s); next.delete(f.key); return next; });
                                setConfirming(null);
                                // Straight into the field, now that it can be typed in.
                                requestAnimationFrame(() => document.getElementById(`i-${f.key}`)?.focus());
                              }}
                            >
                              Change it
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
                              Keep the value from {source}
                            </Button>
                          </span>
                        </Notice>
                      ) : null}
                      {changed ? (
                        <p className="mt-1 text-xs text-warning-700">
                          {sourceLabel}: <strong>{fetched || '(empty)'}</strong>
                          {!readOnly ? (
                            <>
                              {' · '}
                              <button
                                type="button"
                                className="font-semibold underline"
                                onClick={() => {
                                  set(f.key, fetched);
                                  if (f.autofill?.locked) setLockedKeys((s) => new Set(s).add(f.key));
                                }}
                              >
                                Undo
                              </button>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                      {!readOnly && estimatedDates?.includes(f.key) && values[f.key] === initialValues?.[f.key] ? (
                        <p className="mt-1 text-xs text-warning-700">
                          Worked out from the year entered earlier. Please enter the exact date.
                        </p>
                      ) : null}
                      {!readOnly && needsInput?.includes(f.key) && !String(values[f.key] ?? '').trim() ? (
                        <p className="mt-1 text-xs text-warning-700">Please enter this again, as a number.</p>
                      ) : null}
                      {(SPAN_MODULES[moduleKey]?.years === f.key
                        || (SPAN_MODULES[moduleKey]?.lifetime === f.key && values[f.key] === true))
                        && spanText(moduleKey, values) ? (
                        <p className="mt-2 rounded-sm bg-surface-2 px-2 py-1.5 text-sm">
                          <span className="font-semibold">{SPAN_MODULES[moduleKey]!.kind === 'validUntil' ? 'Valid until: ' : 'Project period: '}</span>
                          {spanText(moduleKey, values)}
                        </p>
                      ) : null}
                      {typed && !readOnly ? (
                        <p className="mt-1 text-xs text-warning-700">
                          Not found in {source}. Attach evidence for it.
                        </p>
                      ) : null}
                    </Field>
                  </div>
                );
              })}
            </div>
          </Card>,
          rankingHere ? (
            <JournalRankingCard
              key={`${section}-ranking`}
              issn={String(values.issn ?? '')}
              year={String(values.year ?? '')}
              values={values}
              errors={errors}
              readOnly={readOnly}
              onChange={set}
            />
          ) : null,
        ];
      })}

      {!readOnly ? (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-line bg-canvas py-3">
          <LinkButton href={returnTo ?? `/m/${moduleKey}`} variant="ghost">Cancel</LinkButton>
          {approved ? null : (
            <Button type="button" variant={returnTo ? 'primary' : 'secondary'} disabled={busy} onClick={() => void save('draft')}>
              {returnTo ? 'Save and return to the upload' : 'Save as draft'}
            </Button>
          )}
          <Button type="submit" variant={returnTo && !approved ? 'secondary' : 'primary'} disabled={busy}>
            {busy ? 'Saving…' : approved ? 'Save changes' : 'Save and submit'}
          </Button>
          <p className="ml-auto text-xs text-ink-muted">
            {approved ? 'Every change is kept in the edit history.' : 'Submitting approves the record; the verifying office checks it afterwards.'}
          </p>
        </div>
      ) : null}
      <ConfirmDialog
        open={guard.leaving}
        title="Leave without saving?"
        confirmLabel="Leave without saving"
        onConfirm={guard.leave}
        onCancel={guard.stay}
      >
        What you typed on this page has not been saved.
      </ConfirmDialog>
    </form>
  );
}

function renderInput(
  f: FormFieldDef, value: unknown, onChange: (v: unknown) => void, readOnly: boolean, invalid: boolean,
  ctx: {
    moduleKey: string; recordId?: string; values: Record<string, unknown>; setField: (key: string, value: unknown) => void;
    rememberInstitute: (code: string, country: string) => void;
  },
) {
  const common = { id: `i-${f.key}`, disabled: readOnly, 'aria-invalid': invalid || undefined };
  switch (f.type) {
    case 'institution':
      return (
        <InstitutionPicker
          id={common.id}
          name={String(value ?? '')}
          code={String(ctx.values[`${f.key}Code`] ?? '')}
          disabled={readOnly}
          invalid={invalid}
          excludeHome={!!f.excludeHome}
          onPick={(hit) => { ctx.rememberInstitute(hit.code, hit.country); ctx.setField(f.key, hit.name); ctx.setField(`${f.key}Code`, hit.code); }}
          onClear={() => { ctx.setField(f.key, ''); ctx.setField(`${f.key}Code`, ''); }}
        />
      );
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
          <option value="">{f.emptyLabel ?? '— Select —'}</option>
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
          maxSizeMB={f.maxSizeMB ?? 2}
          value={String(value ?? '')}
          onUploaded={(id) => onChange(id)}
          fieldKey={f.key}
          moduleKey={ctx.moduleKey}
          recordId={ctx.recordId}
        />
      );
    case 'date':
      return (
        <Input
          {...common}
          type="date"
          max={f.notFuture ? new Date().toISOString().slice(0, 10) : undefined}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'decimal':
      return (
        <div className="flex items-center gap-2">
          <Input
            {...common}
            inputMode="decimal"
            className="max-w-32"
            value={String(value ?? '')}
            placeholder={f.placeholder ?? ''}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
          />
          {f.unit ? <span className="text-sm text-ink-muted">{f.unit}</span> : null}
        </div>
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
