'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Asks before unsaved typing is lost. A link click or the Back button opens our own dialog;
 * only closing the tab or reloading falls back to the browser's box (browsers allow nothing else there).
 * `dirtyRef` is a ref, not state, so a save can clear it and navigate in the same tick.
 */
export function useLeaveGuard(dirtyRef: MutableRefObject<boolean>) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const backRef = useRef(false);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; }
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(url.pathname + url.search + url.hash);
    };
    const onPop = () => {
      if (!dirtyRef.current) return;
      // Put the page back where it was and ask.
      history.pushState(null, '', window.location.href);
      backRef.current = true;
      setPending('back');
    };
    // One extra history entry, added when typing starts, so Back can be caught without needing two presses otherwise.
    let guarded = false;
    const onInput = () => {
      if (!guarded && dirtyRef.current) { guarded = true; history.pushState(null, '', window.location.href); }
    };
    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onInput, true);
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('change', onInput, true);
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPop);
    };
  }, [dirtyRef]);

  const stay = useCallback(() => { setPending(null); backRef.current = false; }, []);
  const leave = useCallback(() => {
    const target = pending;
    dirtyRef.current = false;
    setPending(null);
    if (target === 'back') { history.go(-2); return; }
    if (target) router.push(target);
  }, [pending, router, dirtyRef]);

  return { leaving: pending !== null, stay, leave };
}
