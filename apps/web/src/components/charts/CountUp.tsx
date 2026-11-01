'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A number that counts up once, over 600 ms, when it first comes into view. It shows the real number to
 * start with (and to anyone who asked for less motion), so nothing is ever wrong or missing without scripts.
 */
export function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const done = useRef(false);

  useEffect(() => {
    setShown(value);
    const el = ref.current;
    if (!el || done.current || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || value <= 0) { done.current = true; return; }
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || done.current) return;
      done.current = true;
      io.disconnect();
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 600);
        setShown(Math.round(value * (1 - (1 - t) ** 3)));
        if (t < 1) raf = requestAnimationFrame(step);
      };
      setShown(0);
      raf = requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value]);

  return <span ref={ref} className="font-mono tabular-nums">{format ? format(shown) : shown.toLocaleString('en-IN')}</span>;
}
