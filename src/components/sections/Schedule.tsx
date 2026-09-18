"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { Coffee, Confetti, DoorOpen, Lightning, Microphone, Wrench } from "@phosphor-icons/react";
import { Container } from "@/components/ui/Container";
import { DAY, type Slot } from "@/data/schedule";

// One glyph per slot kind. `kind` was already in the data and unused.
const ICONS = {
  doors: DoorOpen,
  keynote: Microphone,
  tracks: Lightning,
  break: Coffee,
  workshop: Wrench,
  closing: Confetti,
} as const;

function SlotBlock({ slot, at, progress }: { slot: Slot; at: number; progress: MotionValue<number> }) {
  // Each slot lifts as the pipe's fill reaches it, so the day reads as advancing.
  const opacity = useTransform(progress, [Math.max(0, at - 0.1), at], [0.35, 1]);
  const Icon = ICONS[slot.kind];

  return (
    <motion.li
      style={{ opacity }}
      tabIndex={0}
      className="schedule-slot group relative rounded-card pl-12 pr-3 outline-offset-4 transition-colors duration-500 hover:bg-white/[.03] focus-visible:bg-white/[.03] md:pb-6 md:pl-3 md:pt-12"
    >
      {/* The node sitting on the pipe. */}
      <span
        aria-hidden="true"
        className="absolute left-[10px] top-2 size-[13px] rounded-full border-2 border-canvas bg-text transition-[box-shadow,transform] duration-500 group-hover:scale-125 group-focus-visible:scale-125 md:left-0 md:top-[7px]"
        style={{ boxShadow: "0 0 16px 3px rgba(255,255,255,.35)" }}
      />

      <Icon
        aria-hidden="true"
        size={22}
        weight="regular"
        className="mb-4 text-muted transition-colors duration-500 group-hover:text-text group-focus-visible:text-text"
      />
      <p className="label !text-[15px] !text-text">{slot.time}</p>
      <p className="mt-2 text-[17px] font-medium leading-snug text-muted transition-colors duration-500 group-hover:text-text group-focus-visible:text-text">
        {slot.title}
      </p>
    </motion.li>
  );
}

/**
 * A day at a glance. One light pipe drawn across the section as you scroll,
 * carrying the four brand colours, with a node per slot that lifts as the
 * fill reaches it. pathLength is driven by useScroll, no scroll listeners.
 */
export function Schedule() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 65%"] });
  // No `reduce` branch on the value itself: that would render one thing on the
  // server and another on a client that already prefers reduced motion. The
  // reduced-motion case is handled in globals.css, which the browser resolves
  // identically either side of hydration.
  const pathLength = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const n = DAY.length;

  return (
    <section className="py-20 md:py-24 lg:py-28">
      <Container>
        <div className="mb-14">
          <h2 className="display text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">A day at a glance</h2>
          <p className="label mt-4">Tentative</p>
        </div>

        <div ref={ref} className="relative">
          {/* Desktop: horizontal pipe. Mobile: vertical pipe on the left. */}
          <svg
            aria-hidden="true"
            className="absolute left-4 top-0 h-full w-[5px] md:left-0 md:top-[13px] md:h-[5px] md:w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              {/*
                userSpaceOnUse, not the default objectBoundingBox: these lines
                have a zero-height (or zero-width) bounding box, which makes a
                bounding-box gradient degenerate and paint nothing. That is why
                the fill never appeared before.
              */}
              <linearGradient id="pipe-h" gradientUnits="userSpaceOnUse" x1="0" y1="50" x2="100" y2="50">
                <stop offset="0" stopColor="#4285F4" />
                <stop offset=".35" stopColor="#34A853" />
                <stop offset=".7" stopColor="#FBBC04" />
                <stop offset="1" stopColor="#EA4335" />
              </linearGradient>
              <linearGradient id="pipe-v" gradientUnits="userSpaceOnUse" x1="50" y1="0" x2="50" y2="100">
                <stop offset="0" stopColor="#4285F4" />
                <stop offset=".35" stopColor="#34A853" />
                <stop offset=".7" stopColor="#FBBC04" />
                <stop offset="1" stopColor="#EA4335" />
              </linearGradient>
            </defs>
            <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(255,255,255,.08)" strokeWidth="100" className="md:hidden" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,.08)" strokeWidth="100" className="hidden md:block" />
            <motion.line x1="50" y1="0" x2="50" y2="100" stroke="url(#pipe-v)" strokeWidth="100" style={{ pathLength }} className="schedule-pipe md:hidden" />
            <motion.line x1="0" y1="50" x2="100" y2="50" stroke="url(#pipe-h)" strokeWidth="100" style={{ pathLength }} className="schedule-pipe hidden md:block" />
          </svg>

          <ol className="relative grid grid-cols-1 gap-2 md:grid-cols-6 md:gap-4">
            {DAY.map((slot, i) => (
              <SlotBlock key={slot.time} slot={slot} at={i / (n - 1)} progress={scrollYProgress} />
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
