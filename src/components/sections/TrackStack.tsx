"use client";

import { useRef } from "react";
import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "motion/react";
import type { Track } from "@/data/tracks";
import { useAccent } from "@/lib/accent";
import { TrackPanel } from "./TrackPanel";

const STACK_TOP_VH = 12; // sticky offset from the viewport top
const STACK_STEP_PX = 24; // extra offset per card, so pinned cards visibly step down
const MIN_SCALE = 0.94; // how small a card gets once fully buried under later ones

/**
 * Cards pin with native `position: sticky` (desktop only, via the `lg:`
 * classes below; mobile renders the exact same markup with no sticky and no
 * scale, so there is no separate mobile code path or client-only branch).
 * Each new card arrives with a higher `z-index` and a slightly larger `top`
 * offset, so it slides up and visibly covers the ones already stuck.
 *
 * One `useScroll` on the whole stack drives every card's shrink through
 * `useTransform`, so scrolling itself stays fully native and threaded:
 * nothing here measures the DOM on scroll or hijacks the scrollbar. That
 * replaces ReactBits' `ScrollStack`, which ran Lenis over the whole window
 * and re-measured every card with `getBoundingClientRect` on every frame
 * while it was mounted, mid-page, fighting the CSS smooth-scroll on `html`.
 * See docs/SPEC.md for the full writeup.
 */
export function TrackStack({ tracks }: { tracks: Track[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const setAccent = useAccent((s) => s.setAccent);
  const n = tracks.length;

  // Which card is "current" follows the same scroll progress that drives the
  // stack, so the nav pill and lockup track whichever track is on top.
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const i = Math.min(n - 1, Math.max(0, Math.floor(p * n)));
    setAccent(tracks[i].color);
  });

  return (
    <div ref={ref} className="flex flex-col gap-10 lg:block lg:space-y-6 lg:pb-[26vh]">
      {tracks.map((track, i) => (
        <TrackCard key={track.id} track={track} index={i} total={n} progress={scrollYProgress} />
      ))}
    </div>
  );
}

function TrackCard({
  track,
  index,
  total,
  progress,
}: {
  track: Track;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  // Starts shrinking once the next card is due, fully shrunk by the time the
  // one after that has arrived: an approximation of "how many cards are
  // stacked on top of me" that only needs the section's own scroll progress,
  // not a live measurement of every sibling.
  const from = index / total;
  const to = Math.min(1, (index + 2) / total);
  const scale = useTransform(progress, [from, to], [1, MIN_SCALE], { clamp: true });

  return (
    <motion.div
      className="lg:sticky lg:[transform:scale(var(--s,1))] lg:will-change-transform"
      style={{
        ["--s" as string]: scale,
        top: `calc(${STACK_TOP_VH}vh + ${index * STACK_STEP_PX}px)`,
        transformOrigin: "top center",
        zIndex: index + 1,
      }}
    >
      <TrackPanel track={track} />
    </motion.div>
  );
}
