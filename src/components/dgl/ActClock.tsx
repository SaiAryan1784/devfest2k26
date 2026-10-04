"use client";

import { useEffect } from "react";
import { m, useMotionValue } from "motion/react";
import { DGL } from "@/data/dgl";
import { formatClock, isFinalCountdown } from "@/lib/dgl/audience-view";
import { remainingMs } from "@/lib/dgl/clock";

const TICK_MS = 250;

/**
 * The phone's small act timer, M:SS in mono from the server's end time and
 * this phone's clock offset. A continuous value, so it lives in MotionValues
 * written by a 250 ms timer (no React render per tick); it turns yellow-hi
 * in the last DGL.finalCountdownS seconds. The stage builds its own big timer.
 */
export function ActClock({ endsAtMs, offset }: { endsAtMs: number; offset: number }) {
  const text = useMotionValue("");
  const color = useMotionValue("var(--color-text)");

  useEffect(() => {
    const tick = () => {
      const ms = remainingMs(endsAtMs, Date.now(), offset);
      text.set(formatClock(ms));
      color.set(isFinalCountdown(ms) ? "var(--color-yellow-hi)" : "var(--color-text)");
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [endsAtMs, offset, text, color]);

  return (
    <p className="font-mono text-[15px] tabular-nums text-muted">
      <span className="sr-only">{DGL.copy.timeLeft} </span>
      <m.span style={{ color }}>{text}</m.span>
    </p>
  );
}
