'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import { apiFetch } from '@/lib/csrf-client';
import { IconUser, IconLogout, IconChevronDown, IconChevronRight } from './Icon';

export interface Crumb { label: string; href?: string }

export function Topbar({
  name, roleLabel, departmentName, crumbs, cycleName,
}: {
  name: string;
  roleLabel: string;
  departmentName: string | null;
  crumbs: Crumb[];
  cycleName: string;
}) {
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    function onClick(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setMenu(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenu(false); }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  async function signOut() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface no-print">
      <div className="flex h-topbar items-center gap-3 px-4 md:px-6">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-bold tracking-[0.06em] text-primary">DARP</span>
          <span className="hidden text-2xs text-ink-faint sm:inline">{cycleName}</span>
        </Link>

        <nav aria-label="Breadcrumb" className="ml-2 hidden min-w-0 flex-1 md:block">
          <ol className="flex items-center gap-1 text-xs text-ink-muted">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
                {i > 0 ? <IconChevronRight width={12} height={12} className="shrink-0 text-ink-faint" /> : null}
                {c.href && i < crumbs.length - 1 ? (
                  <Link href={c.href} className="truncate hover:text-primary hover:underline">{c.label}</Link>
                ) : (
                  <span className={cx('truncate', i === crumbs.length - 1 && 'font-semibold text-ink')}>
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <div ref={wrap} className="relative ml-auto">
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-expanded={menu}
            aria-haspopup="menu"
            className="flex items-center gap-2 rounded-sm border border-line px-2 py-1.5 text-xs hover:bg-surface-2"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-primary">
              <IconUser width={13} height={13} />
            </span>
            <span className="hidden text-left sm:block">
              <span className="block max-w-[14rem] truncate font-semibold text-ink">{name}</span>
              <span className="block text-2xs text-ink-faint">
                {roleLabel}{departmentName ? ` · ${departmentName}` : ''}
              </span>
            </span>
            <IconChevronDown width={12} height={12} className="text-ink-faint" />
          </button>

          {menu ? (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1 w-56 rounded-sm border border-line bg-surface py-1 shadow-md"
            >
              <Link
                href="/profile"
                role="menuitem"
                className="block px-3 py-2 text-sm text-ink hover:bg-surface-2"
              >
                My profile
              </Link>
              <Link
                href="/change-password"
                role="menuitem"
                className="block px-3 py-2 text-sm text-ink hover:bg-surface-2"
              >
                Change password
              </Link>
              <div className="my-1 border-t border-line" />
              <button
                type="button"
                role="menuitem"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface-2"
              >
                <IconLogout width={13} height={13} />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
