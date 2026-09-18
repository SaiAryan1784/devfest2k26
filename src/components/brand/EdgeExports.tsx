"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import type { TrackColor } from "@/data/event";
import { useAccent } from "@/lib/accent";
import { useLoaderState } from "@/lib/loader-state";

const ORDER: TrackColor[] = ["spectrum", "blue", "red", "yellow", "green"];
const SRC = (k: TrackColor) => `/brand/exports/${k}.webp`;
const CYCLE_MS = 6500;
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The hero's lit edges are the real Figma exports. Exactly two <img> per side:
 * the hidden one gets the next src, decodes, then the pair swaps opacity.
 * No will-change, no filters on the wrapper (see CLAUDE.md for why).
 *
 * The edges read the shared `accent` colour rather than owning it: a track
 * dot in the facts row (or the Tracks section, later) can set the accent
 * directly and the edges cross-fade to match, pausing their own auto-cycle
 * while `hold` is set. On the loader's hand-off they slide open from the
 * centre instead of appearing already in place.
 */
export function EdgeExports({ heroRef }: { heroRef: RefObject<HTMLElement | null> }) {
  const reduce = useReducedMotion();
  const ready = useLoaderState((s) => s.done);
  const accent = useAccent((s) => s.accent);
  const setAccent = useAccent((s) => s.setAccent);
  const hold = useAccent((s) => s.hold);
  const inView = useInView(heroRef, { amount: 0.2 });

  // Pair state: which slot is showing and what each slot holds.
  const [slots, setSlots] = useState<{ a: TrackColor; b: TrackColor; active: "a" | "b" }>({ a: "spectrum", b: "blue", active: "a" });
  const shown = useRef<TrackColor>("spectrum");

  // Auto-cycle: advances the shared accent forward, paused off-screen, under
  // reduced motion, while a track dot is holding the current colour, and until
  // the loader has handed off (useInView cannot see the gate above the hero,
  // and the loader lands its amber lockup on this one, so the colours must
  // still match at that moment).
  useEffect(() => {
    if (reduce || !inView || hold || !ready) return;
    const t = setInterval(() => {
      const i = ORDER.indexOf(accent);
      setAccent(ORDER[(i + 1) % ORDER.length]);
    }, CYCLE_MS);
    return () => clearInterval(t);
  }, [reduce, inView, hold, ready, accent, setAccent]);

  // Whenever the shared accent changes, from the cycle above or a hovered
  // track dot, decode the next export and cross-fade the hidden slot.
  useEffect(() => {
    if (accent === shown.current) return;
    let cancelled = false;
    const img = new window.Image();
    img.src = SRC(accent);
    img
      .decode()
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
        shown.current = accent;
        setSlots((s) => {
          const hidden = s.active === "a" ? "b" : "a";
          return { ...s, [hidden]: accent, active: hidden };
        });
      });
    return () => {
      cancelled = true;
    };
  }, [accent]);

  // Pointer parallax as motion values (never React state), gated to when the
  // hero is actually on screen so a mouse move anywhere else on the page
  // never touches this.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  useEffect(() => {
    if (reduce || !inView) return;
    const onMove = (e: PointerEvent) => {
      px.set((e.clientX / window.innerWidth - 0.5) * 2);
      py.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, inView, px, py]);
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
      // The target itself must never depend on `reduce`: that hook resolves
      // after mount (it can't know the client's preference during SSR), so
      // branching the animate *value* on it renders one shape on the server
      // and another the instant the client re-evaluates it, a hydration
      // mismatch. Only `ready` (a store default, identical on both sides)
      // may appear here; `reduce` only ever collapses the transition to
      // duration 0, landing on the exact same target either way.
      initial={{ x: side === "left" ? "38%" : "-38%" }}
      animate={{ x: ready ? "0%" : side === "left" ? "38%" : "-38%" }}
      transition={reduce ? { duration: 0 } : { duration: 1.6, ease: EASE }}
      style={{
        maskImage: `linear-gradient(to ${side === "left" ? "right" : "left"}, #000 45%, transparent 100%)`,
        WebkitMaskImage: `linear-gradient(to ${side === "left" ? "right" : "left"}, #000 45%, transparent 100%)`,
      }}
    >
      <motion.div className="absolute inset-0" style={{ x: side === "left" ? lx : rx, y: side === "left" ? ly : ry }}>
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
