"use client";

import { useEffect, useState } from "react";
import { useMotionValue, type MotionValue } from "motion/react";

const CRITICAL_IMAGES = ["/brand/exports/spectrum.webp"];

/**
 * Real progress for the first paint: fonts ready, the hero's first export decoded,
 * and window load. Returns a MotionValue (0..1) for the bar plus a done flag.
 */
export function useAssetProgress(): { value: MotionValue<number>; done: boolean } {
  const value = useMotionValue(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tasks: Promise<unknown>[] = [
      document.fonts?.ready ?? Promise.resolve(),
      ...CRITICAL_IMAGES.map((src) => {
        const img = new Image();
        img.src = src;
        return img.decode().catch(() => undefined);
      }),
      document.readyState === "complete"
        ? Promise.resolve()
        : new Promise<void>((r) => window.addEventListener("load", () => r(), { once: true })),
    ];
    let finished = 0;
    tasks.forEach((t) =>
      t.then(() => {
        if (cancelled) return;
        finished += 1;
        value.set(finished / tasks.length);
        if (finished === tasks.length) setDone(true);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [value]);

  return { value, done };
}
