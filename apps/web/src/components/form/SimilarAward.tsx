'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Notice } from '@/components/ui';
import { awardModuleOf } from '@darp/shared/awards';

interface Similar { moduleKey: string; moduleName: string; recordId: string; name: string }

/**
 * A line under an award form when the same award (name and date) is already entered, in this module or
 * another of the four award modules. It only points it out: saving is never held up, because one award
 * can truly belong in two of IQAC's sheets.
 */
export function SimilarAward({ moduleKey, recordId, values }: { moduleKey: string; recordId?: string; values: Record<string, unknown> }) {
  const a = awardModuleOf(moduleKey);
  const name = a ? String(values[a.nameField] ?? '') : '';
  const date = a ? String(values[a.dateField] ?? '') : '';
  const [found, setFound] = useState<Similar[]>([]);

  useEffect(() => {
    if (!a || name.trim().length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setFound([]); return; }
    let live = true;
    const t = window.setTimeout(() => {
      const qs = new URLSearchParams({ name, date, ...(recordId ? { exclude: recordId } : {}) });
      void apiJson<Similar[]>(`/api/awards/similar?${qs}`).then((res) => { if (live && res.ok) setFound(res.data); });
    }, 500);
    return () => { live = false; window.clearTimeout(t); };
  }, [a, name, date, recordId]);

  if (found.length === 0) return null;
  return (
    <Notice tone="warning" title="You have already entered this award">
      <ul className="list-disc pl-4">
        {found.map((f) => (
          <li key={f.recordId}>
            Under <strong>{f.moduleName}</strong>: “{f.name}”{' '}
            <Link href={`/m/${f.moduleKey}/${f.recordId}`} className="font-semibold underline">open it</Link>
          </li>
        ))}
      </ul>
      <p className="mt-1">You can still save, if it belongs in both.</p>
    </Notice>
  );
}
