"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { cubicBezier, motion, useMotionValueEvent, useTransform, type MotionValue } from "motion/react";
import { MARK } from "@/components/brand/ident-field";
import { Lockup, PILL } from "@/components/brand/Lockup";
import { EVENT } from "@/data/event";
import { CUT_S, GLIDE_AT, type Flip } from "./cut";
import { IdentField } from "./IdentField";
import type { AssetTasks } from "./useAssetProgress";

const ease = [0.16, 1, 0.3, 1] as const;

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
 * Everything on screen during the hold and the cut. The stripes are the whole
 * picture; the frame carries three captions and a mono readout. The mark
 * pulls into focus out of the light (blur, scale and opacity settling on the
 * same clock the canvas draws to), holds while the field rushes past the
 * camera, then glides onto the billboard's lockup. The canvas dissolves
 * itself during the rush; the wrapper's fade is a backstop.
 */
export function IdentStage({ phase, shown, tasks, flip, lockupRef, onLanded }: Props) {
  const cut = phase === "cut";
  const frame = tasks.type && !cut;
  const readout = useRef<HTMLSpanElement>(null);
  // The focus pull: one ease, three properties, off the drawn-progress clock.
  const focus = useTransform(shown, MARK, [0, 1], { ease: cubicBezier(0.16, 1, 0.3, 1) });
  const markOpacity = useTransform(focus, [0, 0.6, 1], [0, 1, 1]);
  const markScale = useTransform(focus, [0, 1], [1.06, 1]);
  const markBlur = useTransform(focus, [0, 1], [16, 0]);
  const markFilter = useTransform(markBlur, (v) => (v < 0.05 ? "none" : `blur(${v.toFixed(2)}px)`));

  // The readout writes straight to the DOM: a hundred text changes, no renders.
  useMotionValueEvent(shown, "change", (v) => {
    if (readout.current) readout.current.textContent = String(Math.round(v * 100)).padStart(3, "0");
  });

  return (
    <div data-loader-stage aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <motion.div className="absolute inset-0" initial={false} animate={{ opacity: cut ? 0 : 1 }} transition={cut ? { duration: 0.3, delay: 0.9 } : { duration: 0 }}>
        <IdentField shown={shown} cutting={cut} />
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

      {/* The mark: pulled into focus out of the light, held, then the glide. */}
      <div className="absolute inset-0 grid place-items-center">
        <motion.div
          ref={lockupRef}
          data-loader-lockup
          className="w-[min(560px,72vw)] will-change-transform"
          style={{ originX: 0, originY: 0 }}
          initial={false}
          animate={
            cut && flip
              ? { x: [0, 0, flip.x], y: [0, 0, flip.y], scale: [1, 1, flip.scale], opacity: [1, 1, 1, 0] }
              : cut
                ? { opacity: [1, 1, 0] }
                : { x: 0, y: 0, scale: 1, opacity: 1 }
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
          <motion.div style={{ opacity: markOpacity, scale: markScale, filter: markFilter }}>
            <Lockup pill={PILL.spectrum} />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
