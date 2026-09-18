"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { BRACKET_L, BRACKET_R, CAPSULE, INK, LOCKUP_VIEWBOX, NOIDA, PILL, PILL_RECT, RECT_STROKE, WORDMARK, YEAR } from "./lockup-paths";

export { PILL };

/**
 * DevFest Noida 2026 lockup, outlined from the supplied Figma SVG. The 2026 pill
 * colour follows the active track colour. Text is outlined, so no font dependency.
 * Geometry lives in lockup-paths.ts, shared with the loader's staged reveal.
 */
export function Lockup({ pill = PILL.spectrum, className, title = "DevFest Noida 2026" }: { pill?: string; className?: string; title?: string }) {
  return (
    <svg viewBox={LOCKUP_VIEWBOX} fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={title} className={cn("block h-auto w-full overflow-visible", className)}>
      <path d={BRACKET_R} fill="white" stroke={INK} strokeLinejoin="round" />
      <path d={BRACKET_L} fill="white" stroke={INK} strokeLinejoin="round" />
      {WORDMARK.map((d, i) => (
        <path key={i} d={d} fill="white" />
      ))}
      <rect {...CAPSULE} fill="white" stroke={INK} strokeWidth={RECT_STROKE} />
      <motion.rect {...PILL_RECT} stroke={INK} strokeWidth={RECT_STROKE} animate={{ fill: pill }} initial={false} transition={{ duration: 1.2, ease: "easeInOut" }} />
      <path d={YEAR} fill="white" />
      <path d={NOIDA} fill={INK} />
    </svg>
  );
}
