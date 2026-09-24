'use client';

import type {
  ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes,
  TextareaHTMLAttributes, ReactNode,
} from 'react';
import { useId, useState } from 'react';
import { cx } from '@/lib/cx';
import { IconCheck, IconClock, IconAlert, IconLock, IconUpload, IconDoc } from '@/components/shell/Icon';

/* ───────────────────────────── surfaces ───────────────────────────── */

export function Card({
  className, children, padded = true,
}: { className?: string; children: ReactNode; padded?: boolean }) {
  return (
    <section className={cx('rounded-sm border border-line bg-surface', padded && 'p-4', className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/** The small uppercase label that opens a section in the enterprise layout. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-2xs font-bold uppercase tracking-[0.1em] text-ink-faint">{children}</div>
  );
}

/* ───────────────────────────── buttons ────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-ink-invert hover:bg-primary-hover border border-transparent',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-muted border border-transparent hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger-700 text-white border border-transparent hover:bg-danger-500',
  success: 'bg-success-700 text-white border border-transparent hover:bg-success-500',
};

export function Button({
  variant = 'primary', className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-sm px-3.5 py-2 text-sm font-semibold',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_STYLES[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A link styled as a button — for navigation that should look like an action. */
export function LinkButton({
  href, variant = 'primary', className, children,
}: { href: string; variant?: ButtonVariant; className?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className={cx(
        'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-sm px-3.5 py-2 text-sm font-semibold',
        'transition-colors no-underline',
        BUTTON_STYLES[variant],
        className,
      )}
    >
      {children}
    </a>
  );
}

/* ────────────────────────────── inputs ────────────────────────────── */

const CONTROL = [
  'w-full rounded-sm border border-line-strong bg-surface px-2.5 py-1.5',
  'text-md text-ink placeholder:text-ink-faint',
  'disabled:bg-surface-inset disabled:text-ink-muted',
  'aria-[invalid=true]:border-danger-500 aria-[invalid=true]:bg-danger-50',
].join(' ');

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(CONTROL, className)} />;
}

export function Textarea({ className, rows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} rows={rows} className={cx(CONTROL, 'resize-y', className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(CONTROL, 'pr-8', className)}>
      {children}
    </select>
  );
}

export function Checkbox({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      type="checkbox"
      className={cx('h-4 w-4 rounded-xs border-line-strong accent-[var(--color-brand-700)]', className)}
    />
  );
}

/**
 * The field wrapper: label, required marker, help text and error message.
 * Required is visible before typing, not after submitting.
 */
export function Field({
  label, required, help, error, htmlFor, children, hint,
}: {
  label: string;
  required?: boolean;
  help?: string | null;
  error?: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 flex items-baseline gap-1 text-xs font-semibold text-ink">
        <span>{label}</span>
        {required ? (
          <>
            <span aria-hidden="true" className="text-danger-700">*</span>
            <span className="sr-only">(required)</span>
          </>
        ) : null}
        {hint ? <span className="ml-auto text-2xs font-normal text-ink-faint">{hint}</span> : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 flex items-start gap-1 text-xs text-danger-700">
          <IconAlert className="mt-0.5 shrink-0" width={13} height={13} />
          <span>{error}</span>
        </p>
      ) : help ? (
        <p className="mt-1 text-xs text-ink-muted">{help}</p>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── file upload ──────────────────────────── */

export function FileInput({
  accept, maxSizeMB = 5, value, onUploaded, disabled, id,
}: {
  accept?: string[] | null;
  maxSizeMB?: number;
  value?: string;
  onUploaded: (id: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const inputId = useId();
  const types = accept ?? ['pdf', 'jpg', 'png'];

  async function upload(file: File) {
    setError(null);
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`That file is larger than ${maxSizeMB} MB.`);
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.append('file', file);
    const { csrfHeader } = await import('@/lib/csrf-client');
    const res = await fetch('/api/evidence', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      headers: csrfHeader(),
    });
    const json = await res.json();
    setBusy(false);
    if (!json.ok) {
      setError(json.error?.message ?? 'That file could not be uploaded.');
      return;
    }
    setName(file.name);
    onUploaded(json.data.id);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <label
          htmlFor={id ?? inputId}
          className={cx(
            'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-line-strong',
            'bg-surface px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-2',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          <IconUpload />
          {busy ? 'Uploading…' : value ? 'Replace file' : 'Choose file'}
        </label>
        <input
          id={id ?? inputId}
          type="file"
          className="sr-only"
          disabled={disabled || busy}
          accept={types.map((t) => `.${t}`).join(',')}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
        {value ? (
          <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
            <IconDoc />
            {name ?? 'Attached'}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        {types.map((t) => t.toUpperCase()).join(', ')} up to {maxSizeMB} MB.
      </p>
      {error ? <p role="alert" className="mt-1 text-xs text-danger-700">{error}</p> : null}
    </div>
  );
}

/* ───────────────────────────── status ─────────────────────────────── */

const STATE_STYLES: Record<string, { cls: string; label: string }> = {
  draft: { cls: 'bg-surface-inset text-ink-muted border-line-strong', label: 'Draft' },
  submitted: { cls: 'bg-info-50 text-info-700 border-info-100', label: 'Submitted' },
  verified: { cls: 'bg-violet-50 text-violet-700 border-violet-100', label: 'Verified' },
  approved: { cls: 'bg-success-50 text-success-700 border-success-100', label: 'Approved' },
  returned: { cls: 'bg-danger-50 text-danger-700 border-danger-100', label: 'Returned' },
};

/** Status is never colour alone: every pill carries a word and a glyph. */
export function StatePill({ status, className }: { status: string; className?: string }) {
  const s = STATE_STYLES[status] ?? STATE_STYLES.draft!;
  const Glyph = status === 'approved' ? IconCheck
    : status === 'returned' ? IconAlert
      : status === 'verified' ? IconCheck
        : status === 'submitted' ? IconClock
          : IconLock;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-2xs font-semibold',
        s.cls, className,
      )}
    >
      <Glyph width={11} height={11} />
      {s.label}
    </span>
  );
}

/* ───────────────────────────── feedback ───────────────────────────── */

type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const NOTICE_STYLES: Record<NoticeTone, string> = {
  info: 'border-info-100 bg-info-50 text-info-700',
  success: 'border-success-100 bg-success-50 text-success-700',
  warning: 'border-warning-100 bg-warning-50 text-warning-700',
  danger: 'border-danger-100 bg-danger-50 text-danger-700',
};

export function Notice({
  tone = 'info', title, children, className,
}: { tone?: NoticeTone; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} className={cx('rounded-sm border px-3 py-2.5 text-sm', NOTICE_STYLES[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cx('text-sm', title && 'mt-1')}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({
  title, children, action,
}: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-4 py-14 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* ───────────────────────────── tables ─────────────────────────────── */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cx('w-full text-sm', className)}>{children}</table>
    </div>
  );
}

export function Th({
  children, className, scope = 'col',
}: { children?: ReactNode; className?: string; scope?: 'col' | 'row' }) {
  return (
    <th
      scope={scope}
      className={cx(
        'border-b border-line bg-surface-2 px-3 py-2 text-left text-2xs font-bold uppercase',
        'tracking-wider text-ink-muted',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx('border-b border-line px-3 py-2 align-top text-ink', className)}>{children}</td>;
}

/* ───────────────────────────── stat tile ──────────────────────────── */

/** A computed number. Visibly not editable — that is the whole point (doc 08 §8.1 principle 5). */
export function StatTile({
  label, value, note, href, locked = true,
}: { label: string; value: string | number; note?: string; href?: string; locked?: boolean }) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">{label}</span>
        {locked ? <IconLock width={11} height={11} className="shrink-0 text-ink-faint" /> : null}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">{value}</div>
      {note ? <div className="mt-0.5 text-2xs text-ink-muted">{note}</div> : null}
    </>
  );
  const cls = 'block rounded-sm border border-line bg-surface-2 px-3 py-2.5';
  return href
    ? <a href={href} className={cx(cls, 'hover:border-line-strong hover:bg-surface')}>{body}</a>
    : <div className={cls}>{body}</div>;
}
