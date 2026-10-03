"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { m, useMotionValue } from "motion/react";
import { LightPipe } from "@/components/brand/LightPipe";
import { DGL } from "@/data/dgl";
import { remainingMs } from "@/lib/dgl/clock";
import { clockText, RING_COLOR, timerTone, type TimerTone } from "@/lib/dgl/stage-timer";
import { cn } from "@/lib/utils";

const TONE_TEXT: Record<TimerTone, string> = {
  calm: "text-text",
  final: "text-yellow-hi",
  critical: "text-red-hi",
};

type Props = {
  /** Server time the act ends, or null if the server has not set one (never expected while performing). */
  endsAtMs: number | null;
  /** Server minus client clock, from useDglState. */
  offset: number;
  /** True only while the phase is PERFORMING; PERFORMED shows the time copy and does not tick. */
  running: boolean;
};

/**
 * The stage's big M:SS, from the server's end time and this screen's clock
 * offset. The digits are a continuous value, so they live in a MotionValue
 * written by requestAnimationFrame and rendered by `m.span` (no React render
 * per tick; the MotionValue is only written when the text changes). The tone
 * is discrete (calm, final, critical: at most two changes per act), so it is
 * React state, set only on a change, and it recolours the digits and the one
 * LightPipe ring behind them (`run` stays off: no paint animation here).
 *
 * The loop runs only while running and the tab is visible, and is cancelled
 * on unmount. Under reduced motion it still ticks (the time is information,
 * not decoration); nothing here pulses or scales either way.
 */
export function StageTimer({ endsAtMs, offset, running }: Props) {
  const text = useMotionValue("");
  const [tone, setTone] = useState<TimerTone>("calm");
  const toneRef = useRef<TimerTone>("calm");

  useLayoutEffect(() => {
    const read = () => (endsAtMs === null ? (running ? DGL.performanceMs : 0) : remainingMs(endsAtMs, Date.now(), offset));
    const show = (ms: number) => {
      const next = clockText(ms);
      if (text.get() !== next) text.set(next);
      const t = timerTone(ms);
      if (t !== toneRef.current) {
        toneRef.current = t;
        setTone(t);
      }
    };

    // Painted before the first frame so the digits never flash empty.
    text.set(clockText(read()));
    let raf = 0;
    const frame = () => {
      show(read());
      raf = running && !document.hidden ? requestAnimationFrame(frame) : 0;
    };
    raf = requestAnimationFrame(frame);

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      raf = running && !document.hidden ? requestAnimationFrame(frame) : 0;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [endsAtMs, offset, running, text]);

  return (
    <div className="relative grid place-items-center">
      <LightPipe
        shape="ring"
        color={RING_COLOR[tone]}
        tubes={3}
        className="pointer-events-none absolute left-1/2 top-1/2 size-[clamp(16rem,36vw,42rem)] -translate-x-1/2 -translate-y-1/2 opacity-45"
      />
      <p className="relative">
        <span className="sr-only">{DGL.copy.timeLeft} </span>
        <m.span
          className={cn(
            "block whitespace-nowrap font-mono font-medium leading-none tabular-nums transition-colors duration-300 motion-reduce:transition-none",
            "text-[clamp(8rem,20vw,18rem)]",
            TONE_TEXT[tone],
          )}
        >
          {text}
        </m.span>
      </p>
    </div>
  );
}
