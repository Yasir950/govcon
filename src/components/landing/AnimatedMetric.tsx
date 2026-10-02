"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 1200;

function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t);
}

export function AnimatedMetric({ value, label }: { value: string; label: string }) {
  const target = Number(value.replace(/,/g, "")) || 0;
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || started.current) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      started.current = true;
      requestAnimationFrame(() => setCount(target));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        observer.disconnect();

        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / DURATION_MS);
          setCount(Math.round(target * easeOutQuad(progress)));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [target]);

  return (
    <div className="metric" ref={ref}>
      <b>
        {count.toLocaleString("en-US")}
        {target > 0 && "+"}
      </b>
      <span>{label}</span>
    </div>
  );
}
