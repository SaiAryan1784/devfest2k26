"use client";

import type { ReactNode, RefObject } from "react";
import { motion, type MotionValue } from "motion/react";
import DecryptedText from "@/components/reactbits/DecryptedText";
import { EVENT } from "@/data/event";
import { LockupReveal } from "./LockupReveal";
import type { AssetTask, AssetTasks } from "./useAssetProgress";

/** Where the loader's lockup has to travel to land on the hero's, in its own (dolly-corrected) coordinates. */
export type Flip = { x: number; y: number; scale: number };

const ease = [0.16, 1, 0.3, 1] as const;
const SPECTRUM = "linear-gradient(90deg, #4285F4, #33C6F5, #34A853, #FBBC04, #FF7A1A, #EA4335)";
/*
 * The light is a dome rising from the centre of the line, as in the moodboard:
 * elliptical masks anchored on the line fade every band toward its ends and its
 * far edge, so nothing ever reads as a rectangle. Masks are applied once at
 * paint; the bands then only ever scale and fade.
 */
const HALO_MASK = "radial-gradient(ellipse 50% 100% at 50% 100%, rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.28) 50%, transparent 100%)";
const CORE_MASK = "radial-gradient(ellipse 42% 100% at 50% 100%, rgb(0 0 0 / 0.95), transparent 100%)";
const FLOOR_MASK = "radial-gradient(ellipse 50% 100% at 50% 0%, rgb(0 0 0 / 0.3), transparent 100%)";
/** The slate names the three real tasks of the first paint. */
const WORDS: [AssetTask, string][] = [
  ["type", "Type"],
  ["light", "Light"],
  ["stage", "Stage"],
];

type Props = {
  phase: "show" | "cut";
  /** 0..1, the lesser of real progress and the pacing clock. Drives the line and the pill. */
  shown: MotionValue<number>;
  /** The slow push-in on the centre group across the hold. */
  dolly: MotionValue<number>;
  /** How many of the slate's scheduled slots the clock has passed. */
  slot: number;
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
 * Everything on screen during the hold and the cut. Transform and opacity only:
 * the halo and core are static gradients that scale, never a filter; the three
 * MotionValue-driven layers carry will-change because they move every frame of
 * the hold (this is the small case the hero-edges rule in CLAUDE.md is not about).
 */
export function IgnitionStage({ phase, shown, dolly, slot, tasks, flip, lockupRef, onLanded }: Props) {
  const cut = phase === "cut";
  const captions = tasks.type && !cut;

  return (
    <div data-loader-stage aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {/* Corner captions sit outside the dolly so they stay pinned to the frame. */}
      <Caption className="left-6 top-6" show={captions}>
        {EVENT.organiser} presents
      </Caption>
      <Caption className="right-6 top-6 text-right" show={captions}>
        {EVENT.dateLabel}
      </Caption>
      <Caption className="bottom-6 right-6 text-right" show={captions}>
        {EVENT.venue.region}
      </Caption>

      <motion.div className="absolute inset-0" style={{ scale: dolly }}>
        {/* Halo above the line: at the cut it blooms upward into the page. */}
        <motion.div
          className="absolute inset-x-0 bottom-1/2 h-[200px] origin-bottom will-change-transform"
          style={{ scaleX: shown }}
          initial={{ opacity: 0 }}
          animate={cut ? { opacity: 0, scaleY: 5 } : { opacity: 1, scaleY: 1 }}
          transition={cut ? { duration: 0.5, ease: "easeOut" } : { duration: 0.6 }}
        >
          <div className="loader-breathe absolute inset-0" style={{ background: SPECTRUM, maskImage: HALO_MASK, WebkitMaskImage: HALO_MASK }} />
        </motion.div>

        {/* Hot core, near white, the part that reads as the light source. */}
        <motion.div
          className="absolute inset-x-0 bottom-1/2 h-[48px] origin-bottom will-change-transform"
          style={{ scaleX: shown }}
          initial={{ opacity: 0 }}
          animate={cut ? { opacity: 0, scaleY: 16 } : { opacity: 1, scaleY: 1 }}
          transition={cut ? { duration: 0.6, ease: "easeOut" } : { duration: 0.4 }}
        >
          <div
            className="loader-breathe absolute inset-0"
            style={{ background: "linear-gradient(to top, rgb(255 244 214 / 0.85), rgb(255 244 214 / 0))", maskImage: CORE_MASK, WebkitMaskImage: CORE_MASK }}
          />
        </motion.div>

        {/* Faint reflection below: the floor. */}
        <motion.div
          className="absolute inset-x-0 top-1/2 h-[64px] origin-top"
          style={{ scaleX: shown, background: SPECTRUM, maskImage: FLOOR_MASK, WebkitMaskImage: FLOOR_MASK }}
          initial={{ opacity: 0 }}
          animate={{ opacity: cut ? 0 : 1 }}
          transition={{ duration: cut ? 0.3 : 0.6 }}
        />

        {/* The line: 2 px, spectrum, drawn from the centre outward. */}
        <motion.div
          className="absolute inset-x-0 top-1/2 -mt-px h-[2px] will-change-transform"
          style={{ scaleX: shown, background: SPECTRUM }}
          initial={{ opacity: 0 }}
          animate={{ opacity: cut ? 0 : 1 }}
          transition={{ duration: cut ? 0.3 : 0.2 }}
        />

        {/* The mark, resting 28 px above the line. The glide wrapper carries no other motion. */}
        <div className="absolute inset-x-0 bottom-1/2 flex justify-center pb-7">
          <motion.div
            ref={lockupRef}
            data-loader-lockup
            className="w-[min(560px,72vw)] will-change-transform"
            style={{ originX: 0, originY: 0 }}
            initial={false}
            animate={
              cut && flip
                ? { x: flip.x, y: flip.y, scale: flip.scale, opacity: [1, 1, 0] }
                : cut
                  ? { opacity: 0 }
                  : { x: 0, y: 0, scale: 1, opacity: 1 }
            }
            transition={
              cut && flip
                ? { duration: 1, ease, opacity: { duration: 1, times: [0, 0.75, 1], ease: "linear" } }
                : cut
                  ? { duration: 0.6 }
                  : { duration: 0 }
            }
            onAnimationComplete={() => {
              if (cut) onLanded();
            }}
          >
            <LockupReveal fill={shown} />
          </motion.div>
        </div>

        {/* The slate: each word lights once its task has resolved and its slot has come. */}
        <motion.ul
          className="label absolute inset-x-0 top-1/2 mt-6 flex justify-center gap-7"
          initial={{ opacity: 0 }}
          animate={{ opacity: cut ? 0 : 1 }}
          transition={cut ? { duration: 0.3 } : { duration: 0.6, delay: 0.8 }}
        >
          {WORDS.map(([task, word], i) => {
            const lit = tasks[task] && slot > i;
            return (
              <motion.li key={task} className="text-text" animate={{ opacity: lit ? 1 : 0.35 }} transition={{ duration: 0.4 }}>
                {lit ? <DecryptedText text={word} animateOn="view" speed={40} maxIterations={8} useOriginalCharsOnly /> : word}
              </motion.li>
            );
          })}
        </motion.ul>
      </motion.div>
    </div>
  );
}
