"use client";

import { useEffect } from "react";
import { SPECTRUM } from "@/components/brand/slabs";
import { Z } from "@/lib/z";

/** Gold first, then the site's spectrum. */
const COLORS = ["#FBBC04", "#FFE082", "#FFF8DD", ...SPECTRUM.map((p) => p.mid)];
/** How long the show lasts, and the gap between bursts. */
const DURATION_MS = 6000;
const EVERY_MS = 700;

/**
 * Confetti for the winner screen: a few bursts from both sides over about six
 * seconds, in gold and the spectrum. Renders nothing; `canvas-confetti` draws
 * on its own full-screen canvas, which is why it is loaded here, inside the
 * effect, with a dynamic import: it never reaches the bundle of any screen
 * that is not the winner's, and never runs on the server.
 *
 * Skipped under reduced motion and on phones and tablets (no fine pointer or
 * under 1024 px wide), where the winner is on the audience's own screen
 * instead. Cleaned up on unmount: the timer stops and `confetti.reset()`
 * clears whatever is still falling. The import may resolve after the unmount;
 * `stopped` stops it from starting then.
 */
export function Confetti() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine) and (min-width: 1024px)").matches) return;

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let reset: (() => void) | undefined;

    void import("canvas-confetti").then(({ default: confetti }) => {
      if (stopped) return;
      reset = () => confetti.reset();
      const start = Date.now();
      const burst = () => {
        const base = { colors: COLORS, zIndex: Z.overlay, disableForReducedMotion: true, ticks: 220, scalar: 1.2 } as const;
        confetti({ ...base, particleCount: 70, angle: 60, spread: 70, startVelocity: 62, origin: { x: 0, y: 0.85 } });
        confetti({ ...base, particleCount: 70, angle: 120, spread: 70, startVelocity: 62, origin: { x: 1, y: 0.85 } });
        if (Date.now() - start > DURATION_MS * 0.4) confetti({ ...base, particleCount: 40, spread: 100, startVelocity: 40, origin: { x: 0.5, y: 0.3 } });
      };
      burst();
      timer = setInterval(() => {
        if (Date.now() - start >= DURATION_MS) {
          clearInterval(timer);
          return;
        }
        burst();
      }, EVERY_MS);
    });

    return () => {
      stopped = true;
      clearInterval(timer);
      reset?.();
    };
  }, []);

  return null;
}
