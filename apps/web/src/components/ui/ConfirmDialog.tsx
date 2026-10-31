'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './index';

interface Props {
  open: boolean;
  title: string;
  children?: ReactNode;
  /** The safe choice: it is focused first and Esc does the same. */
  stayLabel?: string;
  confirmLabel: string;
  /** The confirm button is red when the action cannot be undone. */
  danger?: boolean;
  busy?: boolean;
  /** Disables the confirm button, e.g. while a required reason is empty. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** One clean confirmation box for the whole app, built on the native <dialog>. */
export function ConfirmDialog({
  open, title, children, stayLabel = 'Stay on this page', confirmLabel, danger = true, busy,
  confirmDisabled, onConfirm, onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onCancel(); }}
      onClick={(e) => { if (e.target === ref.current) onCancel(); }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-md border border-line bg-surface p-0 text-ink shadow-lg backdrop:bg-black/40"
    >
      <div className="p-5">
        <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
        {children ? <div className="mt-2 text-sm text-ink-muted">{children}</div> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" autoFocus onClick={onCancel}>{stayLabel}</Button>
          <Button
            type="button"
            variant={danger ? 'danger' : 'primary'}
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
