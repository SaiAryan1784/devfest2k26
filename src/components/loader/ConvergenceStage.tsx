"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { motion, useMotionValueEvent, type MotionValue } from "motion/react";
import { Lockup, PILL } from "@/components/brand/Lockup";
import { EVENT } from "@/data/event";
import { Convergence } from "./Convergence";
import type { AssetTasks } from "./useAssetProgress";

/** Where the loader's lockup has to travel to land on the hero's. */
export type Flip = { x: number; y: number; scale: number };

const ease = [0.16, 1, 0.3, 1] as const;
/** The cut, in seconds: the mark sharpens at the centre, holds, then glides up to the hero. */
const CUT_S = 1.5;
/** Fraction of the cut at which the glide begins (0.6 s). Loader.tsx times finish() to it. */
export const GLIDE_AT = 0.4;

type Props = {
  phase: "show" | "cut";
  /** 0..1, the lesser of real progress and the pacing clock. */
  shown: MotionValue<number>;
  tasks: AssetTasks;
  flip: Flip | null;
  lockupRef: RefObject<HTMLDivElement | null>;
  onLanded: () => void;
};

function Caption({ className, show, children }: { className: string; show: boolean; children: ReactNode }) {
  return (
    <motion.p
      className={`label absolute hidden sm:block ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: show ? 1 : 0 }}
      transition={{ duration: 0.6 }}
    >
      {children}
    </motion.p>
  );
}

/**
 * Everything on screen during the hold and the cut. The light field is the
 * whole picture; the frame carries three captions and a mono readout. The
 * lockup itself is invisible until the cut: it fades in exactly over the
 * outline the streaks have traced (same box, same geometry), holds for a
 * beat while the light dissolves under it, then glides onto the hero's copy.
 */
export function ConvergenceStage({ phase, shown, tasks, flip, lockupRef, onLanded }: Props) {
  const cut = phase === "cut";
  const frame = tasks.type && !cut;
  const readout = useRef<HTMLSpanElement>(null);

  // The readout writes straight to the DOM: a hundred text changes, no renders.
  useMotionValueEvent(shown, "change", (v) => {
    if (readout.current) readout.current.textContent = String(Math.round(v * 100)).padStart(3, "0");
  });

  return (
    <div data-loader-stage aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: cut ? 0 : 1 }}
        transition={cut ? { duration: 0.45, delay: 0.2 } : { duration: 0.6 }}
      >
        <Convergence shown={shown} cutting={cut} targetRef={lockupRef} />
      </motion.div>

      <Caption className="left-6 top-6" show={frame}>
        {EVENT.organiser} presents
      </Caption>
      <Caption className="right-6 top-6 text-right" show={frame}>
        {EVENT.dateLabel}
      </Caption>
      <Caption className="bottom-6 right-6 text-right" show={frame}>
        {EVENT.venue.region}
      </Caption>
      <motion.p
        className="label absolute bottom-6 left-6 tabular-nums"
        initial={{ opacity: 0 }}
        animate={{ opacity: frame ? 1 : 0 }}
        transition={{ duration: 0.6 }}
      >
        <span ref={readout}>000</span>
        <span className="opacity-60"> / 100</span>
      </motion.p>

      {/* The mark: hidden through the hold, sharpened over the traced outline at the cut, then the glide. */}
      <div className="absolute inset-0 grid place-items-center">
        <motion.div
          ref={lockupRef}
          data-loader-lockup
          className="w-[min(560px,72vw)] will-change-transform"
          style={{ originX: 0, originY: 0 }}
          initial={false}
          animate={
            cut && flip
              ? { x: [0, 0, flip.x], y: [0, 0, flip.y], scale: [1, 1, flip.scale], opacity: [0, 1, 1, 0] }
              : cut
                ? { opacity: [0, 1, 0] }
                : { x: 0, y: 0, scale: 1, opacity: 0 }
          }
          transition={
            cut && flip
              ? {
                  duration: CUT_S,
                  times: [0, GLIDE_AT, 1],
                  ease: ["linear", ease],
                  opacity: { duration: CUT_S, times: [0, 0.25, 0.85, 1], ease: "linear" },
                }
              : cut
                ? { duration: 1.2, times: [0, 0.4, 1] }
                : { duration: 0 }
          }
          onAnimationComplete={() => {
            if (cut) onLanded();
          }}
        >
          <Lockup pill={PILL.spectrum} />
        </motion.div>
      </div>
    </div>
  );
}
