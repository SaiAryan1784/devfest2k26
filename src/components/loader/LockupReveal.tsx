"use client";

import { motion, type MotionValue } from "motion/react";
import {
  BRACKET_L,
  BRACKET_R,
  CAPSULE,
  INK,
  LOCKUP_H,
  LOCKUP_VIEWBOX,
  LOCKUP_W,
  NOIDA,
  PILL,
  PILL_RECT,
  RECT_STROKE,
  WORDMARK,
  YEAR,
} from "@/components/brand/lockup-paths";

const ease = [0.16, 1, 0.3, 1] as const;
const pct = (n: number, of: number) => `${(n / of) * 100}%`;

/*
 * Timings are seconds from the stage mounting. Transforms on SVG children are in
 * viewBox units, not CSS pixels (Motion sets transform-box: fill-box), so a 10 px
 * rise at the 560 px display size is `y: 4`, and the capsule's 14 px is `y: 5.5`.
 */
const draw = {
  hidden: { pathLength: 0, opacity: 1 },
  show: {
    pathLength: 1,
    opacity: 0,
    transition: { pathLength: { duration: 0.9, ease, delay: 0.15 }, opacity: { duration: 0.35, delay: 1.05 } },
  },
};
const solid = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.45, delay: 0.95 } } };
const letters = { hidden: {}, show: { transition: { staggerChildren: 0.045, delayChildren: 0.6 } } };
const letter = { hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease } } };
const capsule = { hidden: { opacity: 0, y: 5.5 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease, delay: 0.9 } } };
// The HTML overlay is the full lockup box (84 units tall), so the same 5.5-unit rise is a percentage of its own height.
const overlay = {
  hidden: { opacity: 0, y: pct(5.5, LOCKUP_H) },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease, delay: 0.9 } },
};

/**
 * The lockup assembling itself: brackets draw on, the wordmark rises letter by
 * letter, the capsule lifts in from below, and the 2026 pill fills with amber as
 * `fill` (0..1) advances. At fill 1 it is pixel-equivalent to <Lockup pill=amber />.
 *
 * Three layers: the SVG with everything except the pill's surface; an HTML div
 * for the fill (a transform on an SVG child is not composited and would repaint
 * the whole mark every frame for the entire hold, a div is a compositor layer);
 * and a static SVG on top with the pill's outline and the white year, so they
 * paint over the fill in the same order as the real lockup.
 */
export function LockupReveal({ fill }: { fill: MotionValue<number> }) {
  return (
    <div className="relative">
      <motion.svg
        viewBox={LOCKUP_VIEWBOX}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block h-auto w-full overflow-visible"
        initial="hidden"
        animate="show"
      >
        <motion.path d={BRACKET_R} fill="none" stroke="white" strokeWidth={1.25} strokeLinejoin="round" variants={draw} />
        <motion.path d={BRACKET_L} fill="none" stroke="white" strokeWidth={1.25} strokeLinejoin="round" variants={draw} />
        <motion.path d={BRACKET_R} fill="white" stroke={INK} strokeLinejoin="round" variants={solid} />
        <motion.path d={BRACKET_L} fill="white" stroke={INK} strokeLinejoin="round" variants={solid} />
        <motion.g variants={letters}>
          {WORDMARK.map((d, i) => (
            <motion.path key={i} d={d} fill="white" variants={letter} />
          ))}
        </motion.g>
        <motion.g variants={capsule}>
          <rect {...CAPSULE} fill="white" stroke={INK} strokeWidth={RECT_STROKE} />
          {/* Dark until filled, so the white year reads from the first frame. */}
          <rect {...PILL_RECT} fill={INK} />
          <path d={NOIDA} fill={INK} />
        </motion.g>
      </motion.svg>

      <motion.div className="absolute inset-0" variants={overlay} initial="hidden" animate="show">
        <div
          className="absolute overflow-hidden rounded-pill"
          style={{
            left: pct(PILL_RECT.x, LOCKUP_W),
            top: pct(PILL_RECT.y, LOCKUP_H),
            width: pct(PILL_RECT.width, LOCKUP_W),
            height: pct(PILL_RECT.height, LOCKUP_H),
          }}
        >
          <motion.div className="absolute inset-0 will-change-transform" style={{ scaleX: fill, originX: 0, background: PILL.spectrum }} />
        </div>
        <svg viewBox={LOCKUP_VIEWBOX} fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0 h-full w-full overflow-visible">
          <rect {...PILL_RECT} fill="none" stroke={INK} strokeWidth={RECT_STROKE} />
          <path d={YEAR} fill="white" />
        </svg>
      </motion.div>
    </div>
  );
}
