"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { LightPipe } from "@/components/brand/LightPipe";
import { GLOW } from "@/components/brand/slabs";
import type { Track } from "@/data/tracks";
import { useAccent } from "@/lib/accent";
import { cn } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;
const ROTATE_MS = 4200;

/** Where each quadrant's light spills in from: always the board's own centre,
 *  so the four washes read as one light leaking outward. */
const ORIGIN = ["100% 100%", "0% 100%", "100% 0%", "0% 0%"] as const;

/**
 * Four tracks as one panel cut into quadrants, not four cards: the floor's
 * bento already owns that family. Exactly one quadrant is lit at a time, and
 * the light is a single element that moves between them (`layoutId`), so the
 * section animates without pinning anything, listening to scroll, or growing
 * past the height its own content needs.
 *
 * The lit quadrant IS the shared accent (`lib/accent.ts`), which is what the
 * nav's lockup pill reads. While the board is on screen it takes `hold`, so
 * the hero's own auto-cycle stands down and the two never fight over the
 * colour; hovering or focusing a quadrant overrides the rotation at once.
 */
export function TrackBoard({ tracks }: { tracks: Track[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { amount: 0.55 });
  const accent = useAccent((s) => s.accent);
  const setAccent = useAccent((s) => s.setAccent);
  const setHold = useAccent((s) => s.setHold);
  const [picked, setPicked] = useState<string | null>(null);

  // Own the accent while the board is on screen, and light the first track at
  // once rather than after a full rotation.
  useEffect(() => {
    if (!inView) return;
    setHold(true);
    if (useAccent.getState().accent === "spectrum") setAccent(tracks[0].color);
    return () => setHold(false);
  }, [inView, setAccent, setHold, tracks]);

  // The rotation reads the store rather than holding its own index, so the
  // interval is never re-created mid-count.
  useEffect(() => {
    if (!inView || reduce || picked) return;
    const t = setInterval(() => {
      const at = tracks.findIndex((x) => x.color === useAccent.getState().accent);
      setAccent(tracks[(at + 1) % tracks.length].color);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [inView, reduce, picked, setAccent, tracks]);

  const lit = tracks.find((t) => t.color === accent) ?? null; // null while the accent is "spectrum"

  return (
    <div ref={ref} className="relative isolate overflow-hidden rounded-panel border border-hair bg-surface">
      <ul className="grid grid-cols-1 gap-px bg-hair sm:grid-cols-2 sm:grid-rows-2">
        {tracks.map((track, i) => (
          <Quadrant
            key={track.id}
            track={track}
            index={i}
            lit={lit?.id === track.id}
            dim={lit !== null && lit.id !== track.id}
            reduce={!!reduce}
            onPick={(id) => {
              setPicked(id);
              if (id) setAccent(track.color);
            }}
          />
        ))}
      </ul>

      {/* The cross of light: the board's own dividers take the lit track's
          colour, so four quadrants read as one circuit. Hidden on mobile,
          where there is no cross to light. */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 hidden h-px -translate-y-1/2 sm:block"
        initial={false}
        animate={{ opacity: lit ? 0.9 : 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.8, ease }}
        style={{ background: `linear-gradient(90deg, transparent, ${GLOW[lit?.color ?? "blue"]}, transparent)` }}
      />
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 sm:block"
        initial={false}
        animate={{ opacity: lit ? 0.9 : 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.8, ease }}
        style={{ background: `linear-gradient(180deg, transparent, ${GLOW[lit?.color ?? "blue"]}, transparent)` }}
      />
    </div>
  );
}

function Quadrant({
  track,
  index,
  lit,
  dim,
  reduce,
  onPick,
}: {
  track: Track;
  index: number;
  lit: boolean;
  dim: boolean;
  reduce: boolean;
  onPick: (id: string | null) => void;
}) {
  const glow = GLOW[track.color];

  return (
    <motion.li
      className="reveal relative isolate bg-surface"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={reduce ? { duration: 0 } : { duration: 0.55, delay: index * 0.07, ease }}
    >
      {/* The one light. Rendered only in the lit quadrant, so Motion's shared
          layout animation slides the same element across the board. */}
      {lit && (
        <motion.span
          aria-hidden="true"
          layoutId="track-lamp"
          className="pointer-events-none absolute inset-0 -z-10"
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 240, damping: 30 }}
          style={{ background: `radial-gradient(105% 85% at ${ORIGIN[index]}, color-mix(in srgb, ${glow} 20%, transparent), transparent 72%)` }}
        />
      )}

      <div
        tabIndex={0}
        onMouseEnter={() => onPick(track.id)}
        onMouseLeave={() => onPick(null)}
        onFocus={() => onPick(track.id)}
        onBlur={() => onPick(null)}
        className="group relative flex h-full flex-col gap-3 p-6 outline-offset-[-4px] sm:min-h-[210px] sm:gap-4 sm:p-8 lg:min-h-[232px] lg:p-10"
      >
        {/* The mark, bleeding toward the corner. `run` only here, so exactly
            one `pipe-run` stroke is ever alive on the page. */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute right-5 top-5 w-12 sm:right-6 sm:top-6 sm:w-14 lg:right-8 lg:top-8 lg:w-[72px]"
          initial={false}
          animate={{ opacity: lit ? 1 : dim ? 0.32 : 0.6, scale: lit ? 1.08 : 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, ease }}
        >
          <LightPipe shape={track.glyph} color={track.color} run={lit} className="w-full" />
        </motion.div>

        <p className="label flex items-baseline gap-2.5 pr-16">
          <span className="text-text">{String(index + 1).padStart(2, "0")}</span>
          <span aria-hidden="true">/</span>
          <span>{track.kicker}</span>
        </p>

        <h3 className="display mt-auto text-[clamp(1.5rem,2.6vw,2.1rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
          {track.name}
        </h3>

        <p
          className={cn(
            "max-w-[34ch] text-[15px] leading-relaxed transition-colors duration-500",
            lit ? "text-text" : "text-muted",
          )}
        >
          {track.line}
        </p>

        {track.format && <span className="label w-fit rounded-pill border border-hair px-3 py-1.5 text-text">{track.format}</span>}
      </div>
    </motion.li>
  );
}
