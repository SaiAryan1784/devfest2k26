"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { Container } from "@/components/ui/Container";
import { DAY, type Slot } from "@/data/schedule";

function SlotNode({ slot, at, progress, reduce }: { slot: Slot; at: number; progress: MotionValue<number>; reduce: boolean }) {
  const opacity = useTransform(progress, [Math.max(0, at - 0.08), at], reduce ? [1, 1] : [0.25, 1]);
  return (
    <li className="relative pl-12 md:pl-0 md:pt-12">
      <motion.span
        aria-hidden="true"
        className="absolute left-[9px] top-1 size-[15px] rounded-full border-2 border-canvas bg-text shadow-[0_0_18px_4px_rgba(255,255,255,.35)] md:left-0 md:top-[9px]"
        style={{ opacity }}
      />
      <p className="label mb-1">{slot.time}</p>
      <p className="text-[17px] font-medium">{slot.title}</p>
    </li>
  );
}

/**
 * A day at a glance. One light pipe drawn across the section as you scroll, with a
 * node per slot. pathLength is driven by useScroll, no scroll listeners.
 */
export function Schedule() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = !!useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 60%"] });
  const pathLength = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [0, 1]);
  const n = DAY.length;

  return (
    <section className="py-24 md:py-32 lg:py-40">
      <Container>
        <div className="mb-12 flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="display text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">A day at a glance</h2>
          <p className="label">Tentative</p>
        </div>

        <div ref={ref} className="relative">
          {/* Desktop: horizontal pipe. Mobile: vertical pipe on the left. */}
          <svg
            aria-hidden="true"
            className="absolute left-[15px] top-0 h-full w-[3px] md:left-0 md:top-[15px] md:h-[3px] md:w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="pipe" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#4285F4" />
                <stop offset=".35" stopColor="#34A853" />
                <stop offset=".7" stopColor="#FBBC04" />
                <stop offset="1" stopColor="#EA4335" />
              </linearGradient>
            </defs>
            <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(255,255,255,.1)" strokeWidth="100" className="md:hidden" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,.1)" strokeWidth="100" className="hidden md:block" />
            <motion.line x1="50" y1="0" x2="50" y2="100" stroke="url(#pipe)" strokeWidth="100" style={{ pathLength }} className="md:hidden" />
            <motion.line x1="0" y1="50" x2="100" y2="50" stroke="url(#pipe)" strokeWidth="100" style={{ pathLength }} className="hidden md:block" />
          </svg>

          <ol className="relative grid grid-cols-1 gap-8 md:grid-cols-6 md:gap-4">
            {DAY.map((slot, i) => (
              <SlotNode key={slot.time} slot={slot} at={i / (n - 1)} progress={scrollYProgress} reduce={reduce} />
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
