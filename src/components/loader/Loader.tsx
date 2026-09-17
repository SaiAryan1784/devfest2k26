"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useSpring } from "motion/react";
import { Lockup } from "@/components/brand/Lockup";
import { useLoaderState } from "@/lib/loader-state";
import { Z } from "@/lib/z";
import { useAssetProgress } from "./useAssetProgress";

const KEY = "devfestLoaderShown";
const SKIP_WINDOW = 300; // assets ready within this: never show (no flash)
const MIN_HOLD = 1400; // once shown, hold at least this long so the choreography completes

const PILLS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853"];

type Phase = "init" | "show" | "hide";

/**
 * Glass preloader. Opaque from the first server-rendered frame so nothing flashes,
 * then the client decides within 300ms whether to run the choreography or drop it.
 * Never mounted under prefers-reduced-motion. Shows once per session.
 */
export function Loader() {
  const reduce = useReducedMotion();
  const finish = useLoaderState((s) => s.finish);
  const { value, done } = useAssetProgress();
  const scaleX = useSpring(value, { stiffness: 80, damping: 20 });
  const [phase, setPhase] = useState<Phase>("init");
  const [shownAt, setShownAt] = useState<number | null>(null);

  // Decide: skip (warm cache / reduced motion / already shown) or show. The
  // decision runs on the next tick so it never sets state synchronously in an effect.
  useEffect(() => {
    // ?noloader=1 skips the gate (used for Lighthouse comparisons and QA).
    const skip = reduce || Boolean(sessionStorage.getItem(KEY)) || new URLSearchParams(location.search).has("noloader");
    const t = setTimeout(
      () => {
        if (skip) {
          setPhase("hide");
          return;
        }
        setPhase((p) => {
          if (p !== "init") return p;
          setShownAt(Date.now());
          return "show";
        });
      },
      skip ? 0 : SKIP_WINDOW,
    );
    return () => clearTimeout(t);
  }, [reduce]);

  // Assets finished while still deciding: skip silently.
  useEffect(() => {
    if (!done || phase !== "init") return;
    const t = setTimeout(() => setPhase("hide"), 0);
    return () => clearTimeout(t);
  }, [done, phase]);

  // Assets finished while showing: release after the minimum hold.
  useEffect(() => {
    if (!done || phase !== "show" || shownAt === null) return;
    const wait = Math.max(0, MIN_HOLD - (Date.now() - shownAt));
    const t = setTimeout(() => setPhase("hide"), wait);
    return () => clearTimeout(t);
  }, [done, phase, shownAt]);

  // Side effects of being visible.
  useEffect(() => {
    if (phase === "hide") {
      sessionStorage.setItem(KEY, "1");
      document.body.style.overflow = "";
      document.body.removeAttribute("aria-busy");
      return;
    }
    document.body.style.overflow = "hidden";
    document.body.setAttribute("aria-busy", "true");
  }, [phase]);

  // The hero starts its entrance as soon as we know the loader is going away.
  useEffect(() => {
    if (phase === "hide") finish();
  }, [phase, finish]);

  const visible = phase !== "hide";
  const choreograph = phase === "show";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="loader"
          role="status"
          aria-live="polite"
          className="fixed inset-0 grid place-items-center bg-canvas"
          style={{ zIndex: Z.loader }}
          exit={{ opacity: 0, transition: { duration: 0.8, ease: "easeInOut" } }}
        >
          <span className="sr-only">Loading DevFest Noida 2026</span>

          {choreograph && (
            <>
              {/* Glow behind the panel shifts from blue toward spectrum as progress fills. */}
              <motion.div
                aria-hidden="true"
                className="absolute h-[60vmin] w-[60vmin] rounded-full"
                style={{ filter: "blur(70px)" }}
                initial={{ opacity: 0, background: "radial-gradient(circle, #4285F4 0%, transparent 65%)" }}
                animate={{
                  opacity: 0.45,
                  background: [
                    "radial-gradient(circle, #4285F4 0%, transparent 65%)",
                    "radial-gradient(circle, #34A853 0%, transparent 65%)",
                    "radial-gradient(circle, #FBBC04 0%, transparent 65%)",
                  ],
                }}
                transition={{ opacity: { duration: 0.8 }, background: { duration: 3.2, repeat: Infinity, repeatType: "reverse" } }}
                exit={{ opacity: 0, scale: 1.4, transition: { duration: 0.6 } }}
              />

              <motion.div
                className="glass relative flex h-[170px] w-[260px] flex-col items-center justify-center gap-5 overflow-hidden rounded-[28px] sm:h-[200px] sm:w-[320px]"
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.06, filter: "blur(12px)", transition: { duration: 0.6, ease: "easeIn" } }}
                transition={{ type: "spring", stiffness: 120, damping: 18 }}
              >
                {/* Shimmer sweep across the glass. Infinite is fine here: it is a loader. */}
                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  initial={{ x: "-120%" }}
                  animate={{ x: "320%" }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "linear", delay: 0.4 }}
                />

                <motion.div
                  className="w-[150px] sm:w-[180px]"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Lockup pill="#FBB000" />
                </motion.div>

                <motion.ul
                  className="flex gap-2"
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } }, exit: { transition: { staggerChildren: 0.04 } } }}
                >
                  {PILLS.map((c, i) => (
                    <motion.li
                      key={c}
                      className="h-[14px] w-[56px] rounded-pill border border-white/15"
                      style={{ background: `${c}66`, boxShadow: "inset 0 1px 0 rgba(255,255,255,.35)" }}
                      variants={{
                        hidden: { x: -24, opacity: 0 },
                        show: { x: 0, opacity: 1, transition: { type: "spring", stiffness: 260, damping: 20 } },
                        exit: { x: (i - 1.5) * 90, opacity: 0, transition: { duration: 0.45, ease: "easeIn" } },
                      }}
                    />
                  ))}
                </motion.ul>

                {/* Progress hairline bound to real asset progress. */}
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-x-6 bottom-4 h-[2px] origin-left rounded-pill"
                  style={{ scaleX, background: "linear-gradient(90deg,#4285F4,#33C6F5,#34A853,#FBBC04,#FF7A1A,#EA4335)" }}
                />
              </motion.div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
