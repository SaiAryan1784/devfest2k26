"use client";

import { useEffect, useEffectEvent } from "react";
import { animate, m, useMotionValue, useReducedMotion } from "motion/react";
import { SPECTRUM } from "@/components/brand/slabs";
import { DGL } from "@/data/dgl";
import { spinLeftMs, wheelTarget } from "@/lib/dgl/wheel";

const SEGMENTS = DGL.wheel.segments;
const STEP = 360 / SEGMENTS;

/** A slow start in the first moments and a long, easing stop: the wheel coasts to its segment. */
const SPIN_EASE = [0.1, 0.6, 0.1, 1] as const;
/** Never snap faster than this, even when the screen joins the spin late. */
const MIN_SPIN_S = 0.8;

/** One colour per segment: the spectrum's mids, then the lighter ramp of the first ones, so no two neighbours match. */
const COLORS = Array.from({ length: SEGMENTS }, (_, i) => {
  const palette = SPECTRUM[i % SPECTRUM.length];
  return i < SPECTRUM.length ? palette.mid : palette.hi;
});
const FACE = `conic-gradient(${COLORS.map((color, i) => `${color} ${i * STEP}deg ${(i + 1) * STEP}deg`).join(", ")})`;
/** Thin dark seams between segments, on top of the colours. */
const SEAMS = `repeating-conic-gradient(rgb(5 5 5 / 0.45) 0deg 0.7deg, transparent 0.7deg ${STEP}deg)`;

type Props = {
  /** The prompt the wheel is about to land on. Only picks the segment; never shown here. */
  prompt: string | null;
  /** Server time of the spin, and the measured offset: how much of the spin is left when this mounts. */
  spunAtMs: number | null;
  offset: number;
};

/**
 * The prompt wheel on the stage: a 12-colour conic circle with a fixed
 * pointer at the top and a dark hub. It turns from 0 to `turns` full
 * rotations plus the angle that brings the prompt's segment under the
 * pointer, over the time the spin has left in server time (at least 0.8 s),
 * so every screen lands together with the phones' prompt. The rotation is a
 * MotionValue (a continuous value), written by `animate`; under reduced motion
 * the duration is 0 and the target is the same, so it simply shows the landed
 * wheel. Mounted only while the spin lasts, so a mount always starts a spin.
 */
export function PromptWheel({ prompt, spunAtMs, offset }: Props) {
  const reduce = !!useReducedMotion();
  const rotate = useMotionValue(0);
  const { segment, turns } = wheelTarget(prompt, SEGMENTS);
  const target = turns * 360 + (360 - (segment * STEP + STEP / 2));
  // Read at the moment the spin starts, not a dependency: a new poll's offset must not restart the wheel.
  const secondsLeft = useEffectEvent(() => Math.max(MIN_SPIN_S, spinLeftMs(spunAtMs, Date.now() + offset) / 1000));

  useEffect(() => {
    rotate.set(0);
    const controls = animate(rotate, target, reduce ? { duration: 0 } : { duration: secondsLeft(), ease: SPIN_EASE });
    return () => controls.stop();
  }, [rotate, target, spunAtMs, reduce]);

  return (
    <div role="img" aria-label={DGL.copy.wheelLabel} className="relative size-[min(52vh,40vw)] shrink-0">
      <m.div
        aria-hidden="true"
        style={{ rotate, backgroundImage: `${SEAMS}, ${FACE}` }}
        className="size-full rounded-full border-[0.6vmin] border-hair shadow-[0_0_6vmin_rgb(0_0_0/0.6)]"
      />
      {/* The hub. */}
      <div aria-hidden="true" className="absolute left-1/2 top-1/2 size-[18%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[0.5vmin] border-hair bg-surface-2" />
      {/* The pointer: a paper-coloured wedge dipping into the rim at the top. */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-0 h-[11%] w-[9%] -translate-x-1/2 -translate-y-[35%] bg-paper drop-shadow-[0_4px_8px_rgb(0_0_0/0.6)] [clip-path:polygon(0_0,100%_0,50%_100%)]"
      />
    </div>
  );
}
