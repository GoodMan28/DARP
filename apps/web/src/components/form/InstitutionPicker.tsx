'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Button, Input } from '@/components/ui';
import { AddInstitute } from './AddInstitute';
import type { InstituteHit } from '@darp/shared/institutions';

/**
 * Chooses an institute from the directory (AISHE, ROR) instead of typing its name, so the same
 * institute is always written the same way. Shows the chosen name with its ID and a Change button;
 * a name typed before the directory existed is shown as such, with the search box under it.
 */
export function InstitutionPicker({ id, name, code, disabled, invalid, excludeHome, allowAdd = true, onPick, onClear }: {
  id: string;
  /** The saved text, "Name, State, Country". */
  name: string;
  /** The saved ID (U-0202); empty when there is none. */
  code: string;
  disabled: boolean;
  invalid: boolean;
  excludeHome: boolean;
  /** "Not listed? Add it" (not wanted where the choice must be an existing entry, such as a merge). */
  allowAdd?: boolean;
  onPick: (hit: InstituteHit) => void;
  onClear: () => void;
}) {
  const listId = useId();
  const [text, setText] = useState('');
  const [hits, setHits] = useState<InstituteHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) { setHits([]); setState('idle'); return; }
    let live = true;
    setState('busy');
    // Typing changes the text on every key press: ask once it has settled, and drop an answer that is out of date.
    const t = setTimeout(() => {
      void apiJson<InstituteHit[]>(`/api/institutions/search?q=${encodeURIComponent(q)}${excludeHome ? '&excludeHome=1' : ''}`).then((res) => {
        if (!live) return;
        setState(res.ok ? 'idle' : 'failed');
        setHits(res.ok ? res.data : []);
        setActive(0);
      });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [text, excludeHome]);

  function pick(hit: InstituteHit) {
    onPick(hit);
    setText('');
    setHits([]);
    setOpen(false);
  }

  /* A saved choice: its name, its ID and a way to change it. */
  if (code) {
    return (
      <>
      <div className="flex flex-wrap items-center gap-2" id={id}>
        <span className="min-w-0 flex-1 text-sm font-semibold">{name}</span>
        <span className="rounded-xs border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-ink-muted">{code}</span>
        {!disabled ? (
          <Button type="button" variant="secondary" className="min-h-11" onClick={() => { onClear(); setTimeout(() => input.current?.focus(), 0); }}>
            Change
          </Button>
        ) : null}
      </div>
      {justAdded ? <p className="mt-1 text-xs text-ink-muted">Added. You can use it now; IQAC will review it.</p> : null}
      </>
    );
  }
  if (disabled) return <p className="text-sm" id={id}>{name || '—'}</p>;

  if (adding && allowAdd) {
    return (
      <AddInstitute
        initialName={text.trim()}
        onCancel={() => setAdding(false)}
        onAdded={(hit) => { setAdding(false); setJustAdded(true); pick(hit); }}
      />
    );
  }

  return (
    <div className="relative">
      {name ? (
        <p className="mb-1.5 rounded-sm border border-warning-100 bg-warning-50 px-2 py-1.5 text-xs text-warning-700">
          Typed earlier: <strong>{name}</strong>. Choose it from the list so it is written the same way everywhere.
        </p>
      ) : null}
      <Input
        ref={input}
        id={id}
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        placeholder="Type the name, e.g. BIT Mesra, IIT Kharagpur, or a code"
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && open && hits[active]) { e.preventDefault(); pick(hits[active]!); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && text.trim().length >= 2 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-sm border border-line bg-surface shadow-lg"
        >
          {hits.map((h, i) => (
            <li
              key={h.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`min-h-11 cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-surface-2' : ''}`}
              // mousedown, not click: the box loses focus (and closes the list) before a click lands
              onMouseDown={(e) => { e.preventDefault(); pick(h); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="block font-semibold">{h.name}</span>
              <span className="block text-xs text-ink-muted">
                {[h.city, h.state, h.country].filter(Boolean).join(', ')} · <span className="font-mono">{h.code}</span>
                {h.pending ? ' · awaiting IQAC' : ''}
              </span>
            </li>
          ))}
          {hits.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-muted" role="presentation">
              {state === 'busy' ? 'Searching…' : state === 'failed' ? 'The search is not available just now.' : 'No match found.'}
            </li>
          ) : null}
          {allowAdd ? (
            <li className="border-t border-line px-3 py-2 text-sm" role="presentation">
              <button type="button" className="font-semibold text-primary hover:underline" onMouseDown={(e) => { e.preventDefault(); setAdding(true); setOpen(false); }}>
                Not listed? Add it
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {allowAdd ? (
        <button type="button" className="mt-1 text-xs font-semibold text-primary hover:underline" onClick={() => setAdding(true)}>
          Not listed? Add it
        </button>
      ) : null}
    </div>
  );
}
