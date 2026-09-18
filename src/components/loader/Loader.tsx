"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useSpring, useTransform } from "motion/react";
import { EVENT } from "@/data/event";
import { useLoaderState } from "@/lib/loader-state";
import { Z } from "@/lib/z";
import { ConvergenceStage, GLIDE_AT, type Flip } from "./ConvergenceStage";
import { useAssetProgress } from "./useAssetProgress";

/** The pacing clock: drawn progress takes at least this long to reach 1. */
const HOLD_MS = 3000;
/** Into the cut: when the black backdrop has fully dissolved. */
const BACKDROP_MS = 600;
/**
 * Into the cut: when the hero is told to start its own entrance. The glide
 * begins at GLIDE_AT of the 1.5 s cut and takes 0.9 s; the hero lockup fades
 * in over 0.9 s from finish(), so it is at about 0.97 when the copy lands.
 */
const FINISH_AT_MS = Math.round(1.5 * GLIDE_AT * 1000) + 250;

type Phase = "init" | "show" | "cut" | "fade" | "hide";

function lockBody() {
  document.body.style.overflow = "hidden";
  document.body.setAttribute("aria-busy", "true");
}
function releaseBody() {
  document.body.style.overflow = "";
  document.body.removeAttribute("aria-busy");
}

/** Where the loader's lockup is now versus where the hero's rests. Null if the hero is not on screen. */
function measure(el: HTMLElement | null): Flip | null {
  const target = document.querySelector<HTMLElement>("[data-hero-lockup]");
  if (!el || !target) return null;
  const from = el.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || to.width === 0 || to.bottom < 0 || to.top > window.innerHeight) return null;
  return { x: to.left - from.left, y: to.top - from.top, scale: to.width / from.width };
}

/**
 * Convergence: the site's title sequence.
 *
 * Opaque from the first server-rendered frame so a visit never flashes the
 * page. It plays on every load, including reloads: the one visit it skips is a
 * back/forward return, which is not an arrival. Under prefers-reduced-motion
 * the gate is hidden by the stylesheet (`.loader-gate` in globals.css) before
 * it can paint, because useReducedMotion() only resolves after mount; the
 * phases still run to `hide`.
 *
 * Phases: init → show → cut → hide (the sequence) or init → fade → hide (skip).
 * `show` holds until drawn progress reaches 1, which by construction is at or
 * after the pacing clock and real asset progress. `cut` dissolves the backdrop,
 * sharpens the mark over the light that traced it, tells the hero to begin,
 * and glides the mark onto the hero's copy.
 *
 * `?loader=1` forces the sequence (client demos, QA); `?noloader=1` skips it.
 */
export function Loader() {
  const reduce = useReducedMotion();
  const finish = useLoaderState((s) => s.finish);
  const setShowing = useLoaderState((s) => s.setShowing);
  const { value, tasks } = useAssetProgress();
  const [phase, setPhase] = useState<Phase>("init");
  const [flip, setFlip] = useState<Flip | null>(null);
  const lockupRef = useRef<HTMLDivElement>(null);
  const cutRef = useRef(false);

  const progress = useSpring(value, { stiffness: 80, damping: 20 });
  const clock = useMotionValue(0);
  // What is drawn: never ahead of what has loaded, never ahead of the choreography.
  const shown = useTransform([progress, clock], (latest: number[]) => Math.min(latest[0], latest[1]));

  // Decide: skip (reduced motion, ?noloader, a back/forward return) or show.
  // Runs on a timer so it never sets state synchronously inside the effect.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const returning = nav?.type === "back_forward";
    const force = params.has("loader") && !reduce;
    const skip = !force && (reduce || params.has("noloader") || returning);
    const t = setTimeout(() => setPhase((p) => (p !== "init" ? p : skip ? "fade" : "show")), 0);
    return () => clearTimeout(t);
  }, [reduce]);

  // The hold: the pacing clock runs while the stage is up. Telling the store
  // first lets the hero drop to its hidden state under the opaque gate, ready
  // to enter on finish().
  useEffect(() => {
    if (phase !== "show") return;
    setShowing(true);
    clock.set(0);
    const c = animate(clock, 1, { duration: HOLD_MS / 1000, ease: "linear" });
    return () => c.stop();
  }, [phase, clock, setShowing]);

  // The cut: the moment drawn progress reaches 1. The hero's lockup is
  // measured once, here, before anything moves.
  useMotionValueEvent(shown, "change", (v) => {
    if (v < 0.99 || phase !== "show" || cutRef.current) return;
    cutRef.current = true;
    setFlip(measure(lockupRef.current));
    setPhase("cut");
  });

  // Side effects of being visible.
  useEffect(() => {
    if (phase === "init" || phase === "show") lockBody();
  }, [phase]);

  // Leaving: hand the page to the hero, and let it scroll once the backdrop
  // is gone. The skip path does both at once.
  useEffect(() => {
    if (phase !== "cut" && phase !== "fade") return;
    const cut = phase === "cut";
    const timers = [setTimeout(finish, cut ? FINISH_AT_MS : 0), setTimeout(releaseBody, cut ? BACKDROP_MS : 0)];
    if (!cut) timers.push(setTimeout(() => setPhase("hide"), BACKDROP_MS));
    return () => timers.forEach(clearTimeout);
  }, [phase, finish]);

  // Whatever path got here, and on unmount, the page scrolls.
  useEffect(() => {
    if (phase === "hide") releaseBody();
  }, [phase]);
  useEffect(() => releaseBody, []);

  if (phase === "hide") return null;
  const exiting = phase === "cut" || phase === "fade";

  return (
    <div
      className="loader-gate fixed inset-0 overflow-hidden"
      style={{ zIndex: Z.loader, pointerEvents: exiting ? "none" : "auto" }}
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading {EVENT.name}</span>
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-canvas"
        initial={false}
        animate={{ opacity: exiting ? 0 : 1 }}
        transition={{ duration: BACKDROP_MS / 1000, ease: "easeInOut" }}
      />
      {(phase === "show" || phase === "cut") && (
        <ConvergenceStage
          phase={phase}
          shown={shown}
          tasks={tasks}
          flip={flip}
          lockupRef={lockupRef}
          onLanded={() => setPhase("hide")}
        />
      )}
    </div>
  );
}
