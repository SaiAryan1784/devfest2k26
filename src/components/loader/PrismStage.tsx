"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { motion, useMotionValueEvent, useTransform, type MotionValue } from "motion/react";
import { Lockup, PILL } from "@/components/brand/Lockup";
import { BEAM_ORDER, labelAnchors } from "@/components/brand/prism-field";
import { PAL } from "@/components/brand/slabs";
import { EVENT } from "@/data/event";
import { TRACKS } from "@/data/tracks";
import { CUT_S, GLIDE_AT, type Flip } from "./cut";
import { PrismField } from "./PrismField";
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
 * Everything on screen during the hold and the cut. The bench is the whole
 * picture; the frame carries three captions, a mono readout and, once the fan
 * has opened, the four track names at the ends of the four beams. The mark
 * appears part by part as the light passes through it (`sweep`), so by the
 * cut it is whole; the cut then glides it onto the hero's copy while the
 * canvas keeps drawing underneath, right up to the swap.
 */
export function PrismStage({ phase, shown, tasks, flip, lockupRef, onLanded }: Props) {
  const cut = phase === "cut";
  const frame = tasks.type && !cut;
  const readout = useRef<HTMLSpanElement>(null);
  const labels = useRef<(HTMLElement | null)[]>([]);

  // The light front, in the mark's own units: through the `{`, the letters, the capsule, the `}`.
  const sweep = useTransform(shown, [0.4, 0.66], [-30, 240]);
  const labelsIn = useTransform(shown, [0.75, 0.95], [0, 1]);

  // The readout writes straight to the DOM: a hundred text changes, no renders.
  useMotionValueEvent(shown, "change", (v) => {
    if (readout.current) readout.current.textContent = String(Math.round(v * 100)).padStart(3, "0");
  });

  // The track names sit where the beams end, measured from the mark's box; written to the DOM, no state.
  useLayoutEffect(() => {
    const place = () => {
      const r = lockupRef.current?.getBoundingClientRect();
      if (!r || !r.width) return;
      labelAnchors({ left: r.left, top: r.top, width: r.width }, window.innerWidth).forEach(([x, y], i) => {
        const el = labels.current[i];
        if (el) {
          el.style.left = `${x.toFixed(1)}px`;
          el.style.top = `${y.toFixed(1)}px`;
        }
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [lockupRef]);

  return (
    <div data-loader-stage aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <PrismField shown={shown} cutting={cut} flip={flip} lockupRef={lockupRef} />

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

      {/* One light, four tracks: the names ride the beams. Fade with the frame at the cut. */}
      <motion.div className="absolute inset-0 hidden sm:block" initial={false} animate={{ opacity: cut ? 0 : 1 }} transition={{ duration: 0.3 }}>
        {BEAM_ORDER.map((c, i) => (
          <motion.span
            key={c}
            ref={(el) => {
              labels.current[i] = el;
            }}
            className="label absolute -translate-y-1/2 whitespace-nowrap"
            style={{ color: PAL[c].hi, opacity: labelsIn }}
          >
            {TRACKS.find((t) => t.color === c)?.name}
          </motion.span>
        ))}
      </motion.div>

      {/* The mark: revealed by the light through the hold, whole by the cut, then the glide. */}
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
          <Lockup pill={PILL.spectrum} sweep={sweep} />
        </motion.div>
      </div>
    </div>
  );
}
