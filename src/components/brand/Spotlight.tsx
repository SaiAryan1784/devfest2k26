"use client";

import { motion, type MotionValue } from "motion/react";

/**
 * Amber stage light: three soft beams (blur on the parent, clip-path on the child
 * so the edges stay soft) plus a hot floor line and reflection. `x` moves the
 * whole rig so it can follow a hovered card.
 */
export function Spotlight({ x }: { x: MotionValue<number> }) {
  const beam = (w: string, blur: number, clip: string, opacity = 1, core = false) => (
    <motion.div
      aria-hidden="true"
      className="absolute left-1/2 top-[-14%] h-[104%] -translate-x-1/2"
      style={{
        width: w,
        x,
        filter: `blur(${blur}px)`,
        opacity,
        maskImage: "linear-gradient(to right, transparent, #000 40% 60%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, #000 40% 60%, transparent)",
      }}
    >
      <i
        className="absolute inset-0 block"
        style={{
          clipPath: clip,
          background: core
            ? "linear-gradient(to bottom, rgba(255,230,150,0) 0%, rgba(255,230,150,.26) 45%, rgba(255,242,200,.9) 100%)"
            : "linear-gradient(to bottom, rgba(251,188,4,0) 0%, rgba(251,188,4,.14) 40%, rgba(255,205,80,.40) 100%)",
        }}
      />
    </motion.div>
  );

  return (
    <>
      {beam("max(64vw, 420px)", 34, "polygon(47% 0, 53% 0, 100% 100%, 0 100%)", 0.75)}
      {beam("max(36vw, 240px)", 18, "polygon(45% 0, 55% 0, 100% 100%, 0 100%)")}
      {beam("max(15vw, 100px)", 9, "polygon(41% 0, 59% 0, 100% 100%, 0 100%)", 1, true)}
    </>
  );
}

export function SpotlightFloor({ x }: { x: MotionValue<number> }) {
  return (
    <div aria-hidden="true" className="relative h-[26vh] w-full overflow-hidden">
      <motion.span
        className="absolute left-1/2 top-0 h-[3px] w-[30vw] -translate-x-1/2 rounded-pill"
        style={{
          x,
          background: "#fff1c2",
          filter: "blur(1px)",
          boxShadow: "0 0 26px 8px rgba(255,215,90,.8), 0 0 110px 40px rgba(251,188,4,.4), 0 0 260px 110px rgba(251,188,4,.16)",
        }}
      />
      <motion.span
        className="absolute left-1/2 top-0 h-full w-[60vw] -translate-x-1/2"
        style={{
          x,
          background: "linear-gradient(to bottom, rgba(255,205,80,.34), rgba(251,188,4,.10) 45%, transparent 85%)",
          maskImage: "radial-gradient(60% 100% at 50% 0%, #000 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(60% 100% at 50% 0%, #000 30%, transparent 100%)",
          filter: "blur(6px)",
        }}
      />
    </div>
  );
}
