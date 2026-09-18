"use client";

import Image from "next/image";
import { motion, type MotionValue } from "motion/react";

/**
 * Amber stage light. The beam is a single pre-rendered texture
 * (public/brand/spotlight/cone.webp, built by `npm run slabs` from three
 * concentric blurred cones baked into one canvas) that only ever moves via
 * the `x` spring: it never resizes and carries no live `filter`, which is
 * what used to make this section stutter.
 *
 * The rig is sized and placed by its caller so the beam *lands on the row of
 * speaker cards* and pools immediately under them. The earlier version ran
 * the beam past the cards to a hot line a third of a viewport below, so the
 * light appeared to belong to nothing.
 */
export function Spotlight({ x }: { x: MotionValue<number> }) {
  return (
    <motion.div
      aria-hidden="true"
      // Anchored to the card row but reaching well above it, so the narrow tip
      // starts up near the heading and the wide base lands on the cards.
      className="pointer-events-none absolute inset-x-0 top-[-38vh] h-[calc(100%+38vh)]"
      style={{ x }}
    >
      <div className="absolute left-1/2 top-0 h-full w-[min(56vw,680px)] -translate-x-1/2">
        <Image src="/brand/spotlight/cone.webp" alt="" fill sizes="680px" className="object-fill" />
      </div>
    </motion.div>
  );
}

/**
 * The pool of light where the beam lands: a tight ellipse plus a hot rim,
 * sitting directly under the card row. Static gradients, moved only by the
 * same spring as the beam.
 */
export function SpotlightPool({ x }: { x: MotionValue<number> }) {
  return (
    <motion.div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-full h-[18vh]" style={{ x }}>
      <span
        className="absolute left-1/2 top-0 h-[2px] w-[min(34vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-pill"
        style={{
          background: "#fff1c2",
          boxShadow: "0 0 24px 6px rgba(255,215,90,.55), 0 0 90px 30px rgba(251,188,4,.25)",
        }}
      />
      <span
        className="absolute left-1/2 top-0 h-full w-[min(62vw,820px)] -translate-x-1/2"
        style={{
          background: "radial-gradient(50% 78% at 50% 0%, rgba(255,205,80,.30) 0%, rgba(251,188,4,.09) 45%, transparent 82%)",
        }}
      />
    </motion.div>
  );
}
