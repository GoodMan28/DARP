import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(QUERY);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

/** True when charts may animate: not on the server, and not when the person asked for less motion. */
export function useMotionOk(): boolean {
  return useSyncExternalStore(subscribe, () => !window.matchMedia(QUERY).matches, () => false);
}
