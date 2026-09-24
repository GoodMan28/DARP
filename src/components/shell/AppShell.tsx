import type { ReactNode } from 'react';
import { Sidebar, type SidebarGroup } from './Sidebar';
import { Topbar, type Crumb } from './Topbar';
import type { SessionUser } from '@/server/auth/session';
import { ROLE_LABEL } from '@/lib/roles';

export interface ShellProps {
  user: SessionUser;
  /** Module groups already filtered for this user's role, built in the page's loader. */
  groups: SidebarGroup[];
  crumbs: Crumb[];
  title: string;
  subtitle?: string;
  cycleName: string;
  /** Right-aligned page actions, e.g. Export / Add record buttons. */
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  user, groups, crumbs, title, subtitle, cycleName, actions, children,
}: ShellProps) {
  return (
    <div className="min-h-dvh bg-canvas">
      <a href="#main" className="skip-link">Skip to main content</a>
      <div className="flex min-h-dvh">
        <Sidebar groups={groups} roleLabel={ROLE_LABEL[user.role]} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            name={user.name}
            roleLabel={ROLE_LABEL[user.role]}
            departmentName={user.departmentName}
            crumbs={crumbs}
            cycleName={cycleName}
          />
          <main id="main" tabIndex={-1} className="flex-1 px-4 py-5 md:px-6 md:py-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
                {subtitle ? <p className="mt-1 max-w-3xl text-sm text-ink-muted">{subtitle}</p> : null}
              </div>
              {actions ? <div className="flex flex-wrap gap-2 no-print">{actions}</div> : null}
            </div>
            {children}
          </main>
          <footer className="border-t border-line px-4 py-4 text-2xs text-ink-faint md:px-6">
            DARP · Internal Quality Assurance Cell, Birla Institute of Technology, Mesra ·
            {' '}{cycleName} · Internal use only
          </footer>
        </div>
      </div>
    </div>
  );
}
