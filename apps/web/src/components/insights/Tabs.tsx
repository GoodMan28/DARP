'use client';

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

/** `count` is the number shown on the tab; leave it out for a tab that is not a list. */
export interface TabDef { id: string; label: string; count?: number; content: ReactNode }

/** A small tab strip: one panel shows at a time, the arrow keys move between tabs. The panels are drawn by the server. */
export function Tabs({ tabs, label }: { tabs: TabDef[]; label: string }) {
  const base = useId();
  const [active, setActive] = useState(() => Math.max(0, tabs.findIndex((t) => t.count === undefined || t.count > 0)));

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    document.getElementById(`${base}-tab-${next}`)?.focus();
  }

  return (
    <div className="min-w-0">
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t, i) => (
          <button
            key={t.id} id={`${base}-tab-${i}`} type="button" role="tab" aria-selected={i === active} aria-controls={`${base}-panel-${i}`}
            tabIndex={i === active ? 0 : -1} onClick={() => setActive(i)} onKeyDown={(e) => onKey(e, i)}
            className={cx(
              '-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold',
              i === active ? 'border-maroon-700 text-maroon-700' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.count === undefined ? null : (
              <span className={cx('ml-1.5 rounded-full px-1.5 py-0.5 font-mono text-2xs tabular-nums', i === active ? 'bg-maroon-100 text-maroon-800' : 'bg-ink-100 text-ink-muted')}>{t.count}</span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.id} id={`${base}-panel-${i}`} role="tabpanel" aria-labelledby={`${base}-tab-${i}`} hidden={i !== active} className="pt-4">
          {t.content}
        </div>
      ))}
    </div>
  );
}
