"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import type { TrackColor } from "@/data/event";
import { useAccent } from "@/lib/accent";

const ORDER: TrackColor[] = ["spectrum", "blue", "red", "yellow", "green"];
const SRC = (k: TrackColor) => `/brand/exports/${k}.webp`;
const CYCLE_MS = 6500;

/**
 * The hero's lit edges are the real Figma exports. Exactly two <img> per side:
 * the hidden one gets the next src, decodes, then the pair swaps opacity.
 * No will-change, no filters on the wrapper (see CLAUDE.md for why).
 */
export function EdgeExports({ heroRef }: { heroRef: RefObject<HTMLElement | null> }) {
  const reduce = useReducedMotion();
  const setAccent = useAccent((s) => s.setAccent);
  const inView = useInView(heroRef, { amount: 0.2 });

  // Pair state: which slot is showing and what each slot holds.
  const [slots, setSlots] = useState<{ a: TrackColor; b: TrackColor; active: "a" | "b" }>({ a: "spectrum", b: "blue", active: "a" });
  const idx = useRef(0);

  useEffect(() => {
    if (reduce || !inView) return;
    const t = setInterval(async () => {
      idx.current = (idx.current + 1) % ORDER.length;
      const next = ORDER[idx.current];
      const img = new Image();
      img.src = SRC(next);
      try {
        await img.decode();
      } catch {}
      setSlots((s) => {
        const hidden = s.active === "a" ? "b" : "a";
        return { ...s, [hidden]: next, active: hidden };
      });
      setAccent(next);
    }, CYCLE_MS);
    return () => clearInterval(t);
  }, [reduce, inView, setAccent]);

  // Pointer parallax as motion values (never React state).
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      px.set((e.clientX / window.innerWidth - 0.5) * 2);
      py.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, px, py]);
  const sx = useSpring(px, { stiffness: 60, damping: 20 });
  const sy = useSpring(py, { stiffness: 60, damping: 20 });
  const lx = useTransform(sx, (v) => v * -14);
  const rx = useTransform(sx, (v) => v * 14);
  const ly = useTransform(sy, (v) => v * -10);
  const ry = useTransform(sy, (v) => v * 10);

  // Scroll parallax: edges drift up as the hero leaves.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const drift = useTransform(scrollYProgress, [0, 1], ["0%", "-8%"]);

  // Plain render helper, not a component: a nested component type would remount the imgs every render.
  const renderSide = (side: "left" | "right") => (
    <motion.div
      key={side}
      aria-hidden="true"
      className={`absolute -top-[6%] h-[112%] w-[50%] md:w-[56%] ${side === "left" ? "left-0" : "right-0"}`}
      style={{
        x: side === "left" ? lx : rx,
        y: side === "left" ? ly : ry,
        maskImage: `linear-gradient(to ${side === "left" ? "right" : "left"}, #000 45%, transparent 100%)`,
        WebkitMaskImage: `linear-gradient(to ${side === "left" ? "right" : "left"}, #000 45%, transparent 100%)`,
      }}
    >
      <motion.div className="absolute inset-0" style={{ y: drift }}>
        {(["a", "b"] as const).map((slot) => (
          <img
            key={slot}
            src={SRC(slots[slot])}
            srcSet={`/brand/exports/${slots[slot]}-540.webp 540w, ${SRC(slots[slot])} 1080w`}
            sizes="(max-width: 767px) 100vw, 60vw"
            alt=""
            decoding="async"
            fetchPriority={slot === "a" ? "high" : "low"}
            className={`absolute top-0 h-full w-auto max-w-none transition-opacity duration-[1800ms] ease-in-out ${side === "left" ? "left-0" : "right-0"} ${slots.active === slot ? "opacity-100" : "opacity-0"}`}
          />
        ))}
      </motion.div>
    </motion.div>
  );

  return (
    <div className="pointer-events-none absolute inset-0 -z-10">
      {renderSide("left")}
      {renderSide("right")}
      {/* Keeps the corridor dark behind the copy on narrow screens where the two edges nearly meet. */}
      <div className="absolute inset-0 md:hidden" style={{ background: "radial-gradient(70% 55% at 50% 50%, rgba(5,5,5,.75), rgba(5,5,5,0) 100%)" }} />
    </div>
  );
}
