"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useSpring, useTransform } from "motion/react";
import { EVENT } from "@/data/event";
import { useLoaderState } from "@/lib/loader-state";
import { Z } from "@/lib/z";
import { IgnitionStage, type Flip } from "./IgnitionStage";
import { useAssetProgress } from "./useAssetProgress";

const KEY = "devfestLoaderShown";
/** Assets ready within this: never show (no flash on a warm cache). */
const SKIP_WINDOW = 300;
/** The pacing clock: the line takes at least this long to reach the edges. */
const HOLD_MS = 2600;
/** Into the cut: when the hero is told to start its own entrance. */
const FINISH_AT_MS = 250;
/** Into the cut: when the black backdrop has fully dissolved. */
const BACKDROP_MS = 600;
/** Fractions of the clock after which the slate's three words may light. */
const SLOT_AT = [0.35, 0.6, 0.85];

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
function measure(el: HTMLElement | null, dollyScale: number): Flip | null {
  const target = document.querySelector<HTMLElement>("[data-hero-lockup]");
  if (!el || !target) return null;
  const from = el.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || to.width === 0 || to.bottom < 0 || to.top > window.innerHeight) return null;
  // The glide wrapper sits inside the dolly group, so a local translate moves the
  // screen by dollyScale times as much; the scale is unaffected by the ancestor.
  return { x: (to.left - from.left) / dollyScale, y: (to.top - from.top) / dollyScale, scale: to.width / from.width };
}

/**
 * Ignition: the site's title sequence.
 *
 * Opaque from the first server-rendered frame so a cold visit never flashes the
 * page, then the client decides within 300 ms whether to run the sequence or
 * drop the gate. Under prefers-reduced-motion the gate is hidden by the
 * stylesheet (`.loader-gate` in globals.css) before it can paint, because
 * useReducedMotion() only resolves after mount; the phases still run to `hide`.
 *
 * Phases: init → show → cut → hide (the sequence) or init → fade → hide (skip).
 * `show` holds until the line has reached both edges, which by construction is
 * at or after the pacing clock and real asset progress. `cut` dissolves the
 * backdrop, tells the hero to begin, and glides this lockup onto the hero's.
 *
 * `?loader=1` forces the sequence (client demos, QA); `?noloader=1` skips it.
 */
export function Loader() {
  const reduce = useReducedMotion();
  const finish = useLoaderState((s) => s.finish);
  const setShowing = useLoaderState((s) => s.setShowing);
  const { value, tasks, done } = useAssetProgress();
  const [phase, setPhase] = useState<Phase>("init");
  const [slot, setSlot] = useState(0);
  const [flip, setFlip] = useState<Flip | null>(null);
  const lockupRef = useRef<HTMLDivElement>(null);
  const cutRef = useRef(false);

  const progress = useSpring(value, { stiffness: 80, damping: 20 });
  const clock = useMotionValue(0);
  const dolly = useMotionValue(1);
  // What is drawn: never ahead of what has loaded, never ahead of the choreography.
  const shown = useTransform([progress, clock], (latest: number[]) => Math.min(latest[0], latest[1]));

  // Decide: skip (reduced motion, already shown this session, ?noloader) or show.
  // Runs on a timer so it never sets state synchronously inside the effect.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const force = params.has("loader") && !reduce;
    const skip = !force && (reduce || Boolean(sessionStorage.getItem(KEY)) || params.has("noloader"));
    const t = setTimeout(
      () => setPhase((p) => (p !== "init" ? p : skip ? "fade" : "show")),
      skip || force ? 0 : SKIP_WINDOW,
    );
    return () => clearTimeout(t);
  }, [reduce]);

  // Assets finished while still deciding: skip silently.
  useEffect(() => {
    if (!done || phase !== "init") return;
    const t = setTimeout(() => setPhase((p) => (p === "init" ? "fade" : p)), 0);
    return () => clearTimeout(t);
  }, [done, phase]);

  // The hold: the pacing clock and the slow push-in run while the stage is up.
  // Telling the store first lets the hero drop to its hidden state under the
  // opaque gate, ready to enter on finish().
  useEffect(() => {
    if (phase !== "show") return;
    setShowing(true);
    clock.set(0);
    dolly.set(1);
    const c = animate(clock, 1, { duration: HOLD_MS / 1000, ease: "linear" });
    const d = animate(dolly, 1.03, { duration: HOLD_MS / 1000, ease: "easeOut" });
    return () => {
      c.stop();
      d.stop();
    };
  }, [phase, clock, dolly, setShowing]);

  // The slate lights on integer slots, never on a float per frame.
  useMotionValueEvent(clock, "change", (v) => {
    const s = SLOT_AT.filter((t) => v >= t).length;
    setSlot((prev) => (prev === s ? prev : s));
  });

  // The cut: the moment the line reaches both edges. The hero's lockup is
  // measured once, here, before anything moves.
  useMotionValueEvent(shown, "change", (v) => {
    if (v < 0.99 || phase !== "show" || cutRef.current) return;
    cutRef.current = true;
    dolly.stop();
    setFlip(measure(lockupRef.current, dolly.get()));
    setPhase("cut");
  });

  // Side effects of being visible.
  useEffect(() => {
    if (phase === "init" || phase === "show") lockBody();
  }, [phase]);

  // Leaving: remember, hand the page to the hero, and let it scroll once the
  // backdrop is gone. The skip path does all three at once.
  useEffect(() => {
    if (phase !== "cut" && phase !== "fade") return;
    sessionStorage.setItem(KEY, "1");
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
        <IgnitionStage
          phase={phase}
          shown={shown}
          dolly={dolly}
          slot={slot}
          tasks={tasks}
          flip={flip}
          lockupRef={lockupRef}
          onLanded={() => setPhase("hide")}
        />
      )}
    </div>
  );
}
