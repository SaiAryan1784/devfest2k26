"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";
import { useHeroView } from "@/lib/hero-view";
import { useLoaderState } from "@/lib/loader-state";
import { useFinePointer } from "@/lib/use-fine-pointer";

// WebGL, client only, gated below. See SplashCursor.tsx for the DPR cap, the
// pause wiring and the cleanup this project's copy adds on top of upstream.
const SplashCursor = dynamic(() => import("@/components/reactbits/SplashCursor"), { ssr: false });

/**
 * The site-wide fluid cursor. Mounted once the loader is done and only on a
 * device with an actual mouse (no real cursor on touch, and it would waste
 * mobile battery for nothing); never mounted at all under reduced motion.
 * Those three conditions are effectively permanent once true for a session,
 * so a one-time mount decision is safe.
 *
 * CLAUDE.md's WebGL rule is explicit that this never runs in the hero: while
 * `useHeroView` reports the billboard on screen, `paused` goes true, which
 * is a cheap flag flip inside the running effect (see SplashCursor's
 * `pausedRef`), not a remount, since scrolling past the hero is the one
 * condition here that genuinely toggles back and forth in normal use.
 */
export function CursorFx() {
  const reduce = useReducedMotion();
  const finePointer = useFinePointer();
  const loaderDone = useLoaderState((s) => s.done);
  const heroInView = useHeroView((s) => s.inView);

  if (reduce || !finePointer || !loaderDone) return null;

  return (
    <SplashCursor
      paused={heroInView}
      DYE_RESOLUTION={768}
      SIM_RESOLUTION={96}
      PRESSURE_ITERATIONS={14}
      SPLAT_RADIUS={0.2}
    />
  );
}
