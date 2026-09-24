'use client';

import { useState } from 'react';
import { cx } from '@/lib/cx';
import { AccountsPanel } from './AccountsPanel';
import { MasterListsPanel } from './MasterListsPanel';
import { CyclePanel } from './CyclePanel';
import { AuditPanel } from './AuditPanel';
import { ExportsPanel } from './ExportsPanel';
import { ADMIN_TABS, type AdminTab } from './types';

/**
 * The tabbed IQAC console. Each panel loads its own data on first view, so opening
 * Accounts does not also read the whole audit log.
 */
export function AdminConsole({
  initialTab, currentUserId,
}: { initialTab: AdminTab; currentUserId: string }) {
  const [tab, setTab] = useState<AdminTab>(initialTab);

  return (
    <div>
      <div className="mb-4 border-b border-line">
        <div role="tablist" aria-label="Administration sections" className="-mb-px flex flex-wrap gap-0.5">
          {ADMIN_TABS.map((t) => {
            const selected = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`admin-tab-${t.key}`}
                aria-selected={selected}
                aria-controls={`admin-panel-${t.key}`}
                onClick={() => setTab(t.key)}
                className={cx(
                  'min-h-9 rounded-t-sm border border-b-0 px-3.5 py-2 text-sm font-semibold transition-colors',
                  selected
                    ? 'border-line bg-surface text-primary shadow-[inset_0_2px_0_var(--color-maroon-700)]'
                    : 'border-transparent text-ink-muted hover:bg-surface-2 hover:text-ink',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`admin-panel-${tab}`}
        aria-labelledby={`admin-tab-${tab}`}
        tabIndex={-1}
      >
        {tab === 'accounts' ? <AccountsPanel currentUserId={currentUserId} /> : null}
        {tab === 'lists' ? <MasterListsPanel /> : null}
        {tab === 'cycle' ? <CyclePanel /> : null}
        {tab === 'audit' ? <AuditPanel /> : null}
        {tab === 'exports' ? <ExportsPanel /> : null}
      </div>
    </div>
  );
}
