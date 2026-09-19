"use client";

import { Fragment, type ReactNode } from "react";
import { motion, useTransform, type MotionValue } from "motion/react";
import { cn } from "@/lib/utils";
import { BRACKET_L, BRACKET_R, CAPSULE, INK, LOCKUP_VIEWBOX, NOIDA, PILL, PILL_RECT, RECT_STROKE, REVEAL_X, WORDMARK, YEAR } from "./lockup-paths";

export { PILL };

/** Width of the light front's soft edge, in viewBox units. */
const EDGE = 24;

/** One part of the mark, appearing as the light front (`sweep`, a viewBox x) passes its left edge. */
function Part({ sweep, x0, children }: { sweep: MotionValue<number>; x0: number; children: ReactNode }) {
  const opacity = useTransform(sweep, (x) => Math.min(1, Math.max(0, (x - x0) / EDGE)));
  return <motion.g style={{ opacity }}>{children}</motion.g>;
}

/**
 * DevFest Noida 2026 lockup, outlined from the supplied Figma SVG. The 2026 pill
 * colour follows the active track colour. Text is outlined, so no font dependency.
 * Geometry lives in lockup-paths.ts, shared with the loader's light.
 *
 * `sweep` is the loader's light front in viewBox x: with it, each part appears
 * as the front passes (brackets, letters, capsule). Without it the mark renders
 * whole, with no motion components at all.
 */
export function Lockup({
  pill = PILL.spectrum,
  className,
  title = "DevFest Noida 2026",
  sweep,
}: {
  pill?: string;
  className?: string;
  title?: string;
  sweep?: MotionValue<number>;
}) {
  const part = (x0: number, children: ReactNode) => (sweep ? <Part sweep={sweep} x0={x0}>{children}</Part> : <g>{children}</g>);

  return (
    <svg viewBox={LOCKUP_VIEWBOX} fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={title} className={cn("block h-auto w-full overflow-visible", className)}>
      {part(REVEAL_X.bracketR, <path d={BRACKET_R} fill="white" stroke={INK} strokeLinejoin="round" />)}
      {part(REVEAL_X.bracketL, <path d={BRACKET_L} fill="white" stroke={INK} strokeLinejoin="round" />)}
      {WORDMARK.map((d, i) => (
        <Fragment key={i}>{part(REVEAL_X.letters[i], <path d={d} fill="white" />)}</Fragment>
      ))}
      {part(
        REVEAL_X.capsule,
        <>
          <rect {...CAPSULE} fill="white" stroke={INK} strokeWidth={RECT_STROKE} />
          <motion.rect {...PILL_RECT} stroke={INK} strokeWidth={RECT_STROKE} animate={{ fill: pill }} initial={false} transition={{ duration: 1.2, ease: "easeInOut" }} />
          <path d={YEAR} fill="white" />
          <path d={NOIDA} fill={INK} />
        </>,
      )}
    </svg>
  );
}
