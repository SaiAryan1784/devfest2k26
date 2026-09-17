"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders children only once the wrapper is within `rootMargin` of the viewport.
 * Keeps heavy below-the-fold sections (Lenis, GSAP, WebGL, split-flap) out of the
 * first paint. `minHeight` reserves space so nothing shifts when it mounts.
 */
export function LazyMount({ children, minHeight = "60vh", rootMargin = "800px 0px", id, className }: { children: React.ReactNode; minHeight?: string; rootMargin?: string; id?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (!("IntersectionObserver" in window)) {
      const t = setTimeout(() => setShow(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, show]);

  return (
    <div ref={ref} id={id} className={className} style={show ? undefined : { minHeight }}>
      {show ? children : null}
    </div>
  );
}
