'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import { IconMenu, IconClose, IconSearch, IconDoc } from './Icon';

export interface SidebarItem {
  key: string;
  name: string;
  href: string;
  count?: number;
}

export interface SidebarGroup {
  name: string;
  items: SidebarItem[];
}

/**
 * The filter navigator: a persistent, filterable module list, as in the mockup.
 * It does no authorization of its own — the page passes only permitted groups.
 */
export function Sidebar({
  groups, roleLabel,
}: { groups: SidebarGroup[]; roleLabel: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); toggleRef.current?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const needle = filter.trim().toLowerCase();
  const shown = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !needle || i.name.toLowerCase().includes(needle)) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="sidebar-nav"
        className="fixed left-3 top-[52px] z-30 rounded-sm border border-line bg-surface p-2 text-ink shadow-sm lg:hidden no-print"
      >
        <IconMenu title="Open navigation" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-30 bg-ink-950/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <div
        id="sidebar-nav"
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-sidebar flex-col border-r border-line bg-surface',
          'transition-transform lg:static lg:translate-x-0 no-print',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <span className="min-w-0">
            <span className="block truncate text-2xs font-bold uppercase tracking-wider text-ink-faint">
              Signed in as
            </span>
            <span className="block truncate text-sm font-semibold leading-tight text-ink">{roleLabel}</span>
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto rounded-sm p-1 text-ink-muted hover:bg-surface-2 lg:hidden"
          >
            <IconClose title="Close navigation" />
          </button>
        </div>

        <div className="border-b border-line px-2 py-2">
          <div className="relative">
            <IconSearch
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint"
              width={14}
              height={14}
            />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter modules"
              aria-label="Filter modules"
              className="w-full rounded-sm border border-line bg-surface-2 py-1.5 pl-7 pr-2 text-xs text-ink placeholder:text-ink-faint"
            />
          </div>
        </div>

        <nav aria-label="Data modules" className="flex-1 overflow-y-auto px-2 py-2">
          <Link
            href="/dashboard"
            aria-current={pathname === '/dashboard' ? 'page' : undefined}
            className={cx(
              'mb-1 block rounded-sm px-2.5 py-1.5 text-sm font-semibold',
              pathname === '/dashboard'
                ? 'bg-primary-soft text-primary'
                : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
            )}
          >
            Overview
          </Link>

          {shown.map((group) => (
            <div key={group.name} className="mb-2">
              <h2 className="px-2.5 pb-1 pt-2 text-2xs font-bold uppercase tracking-wider text-ink-faint">
                {group.name}
              </h2>
              <ul className="space-y-px">
                {group.items.map((item) => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        data-module={item.key}
                        className={cx(
                          'flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm',
                          active
                            ? 'bg-primary-soft font-semibold text-primary'
                            : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        {typeof item.count === 'number' && item.count > 0 ? (
                          <span className="shrink-0 rounded-xs bg-surface-inset px-1.5 py-0.5 font-mono text-2xs text-ink-muted">
                            {item.count}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {shown.length === 0 ? (
            <p className="px-2.5 py-4 text-xs text-ink-muted">No module matches “{filter}”.</p>
          ) : null}
        </nav>

        <div className="border-t border-line px-3 py-3 text-2xs leading-relaxed text-ink-muted">
          <Link href="/instructions" className="flex items-center gap-1.5 font-semibold text-primary">
            <IconDoc width={13} height={13} />
            Entry guidelines
          </Link>
          <p className="mt-2">
            IQAC · iqac@bitmesra.ac.in
            <br />
            Extension 2411 · Mon–Fri, 10:00–17:00
          </p>
        </div>
      </div>
    </>
  );
}
