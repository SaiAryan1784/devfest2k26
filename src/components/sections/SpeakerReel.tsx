"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { GLOW } from "@/components/brand/slabs";
import type { Speaker } from "@/data/speakers";
import type { TrackColor } from "@/data/event";
import { cn } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;
/** How much wider (desktop) or taller (phone) the open strip is than a closed one. */
const OPEN = 6;
/** How long a speaker stays open before their second photo fades in. */
const ALT_AFTER_MS = 2800;

// Presentation only: each strip's stage light takes the next brand colour.
const LIGHTS: Exclude<TrackColor, "spectrum">[] = ["blue", "red", "yellow", "green"];

/**
 * Last year's stage as a reel of photo strips: one open in full colour under
 * its own stage light, the rest waiting as dim grey slices. Hover, focus or
 * tap opens a strip. Side by side from `md`, stacked bands on phones. Photos
 * only, no names (see speakers.ts).
 *
 * The strips resize with a CSS flex-grow transition rather than Motion's
 * `layout` FLIP: FLIP scales the box with a transform, which would squash the
 * photos mid-move, while flex-grow lets `object-cover` recrop them honestly on
 * every frame. Everything else (the entrance curtains, the light, the push-in)
 * is Motion. Reduced motion collapses all of it in globals.css
 * (`.reel-strip`) and here via `transition`.
 */
export function SpeakerReel({ speakers }: { speakers: Speaker[] }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLUListElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  // The curtain reveal keys off the list, never the strips themselves: a strip
  // that starts fully clipped never counts as on screen to an
  // IntersectionObserver (Chrome), so its own whileInView would never fire.
  const revealed = useInView(ref, { once: true, amount: 0.15 });
  const [active, setActive] = useState(0);
  const [altOn, setAltOn] = useState(false);

  const open = (i: number) => {
    if (i === active) return;
    setActive(i);
    setAltOn(false);
  };

  // A second angle from the same talk, once the speaker has been open a moment.
  useEffect(() => {
    if (reduce || !inView || !speakers[active]?.alt) return;
    const t = setTimeout(() => setAltOn(true), ALT_AFTER_MS);
    return () => clearTimeout(t);
  }, [active, reduce, inView, speakers]);

  return (
    <ul ref={ref} className="flex h-[680px] flex-col gap-2 md:h-[clamp(460px,72vh,620px)] md:flex-row md:gap-3">
      {speakers.map((s, i) => (
        <Strip
          key={s.id}
          speaker={s}
          index={i}
          total={speakers.length}
          light={GLOW[LIGHTS[i % LIGHTS.length]]}
          active={i === active}
          revealed={revealed}
          altOn={i === active && altOn}
          reduce={!!reduce}
          onOpen={() => open(i)}
        />
      ))}
    </ul>
  );
}

function Strip({
  speaker,
  index,
  total,
  light,
  active,
  revealed,
  altOn,
  reduce,
  onOpen,
}: {
  speaker: Speaker;
  index: number;
  total: number;
  light: string;
  active: boolean;
  revealed: boolean;
  altOn: boolean;
  reduce: boolean;
  onOpen: () => void;
}) {
  const label = `Speaker photo ${index + 1} of ${total}, DevFest Noida 2025`;

  return (
    <motion.li
      className="reel-strip relative min-h-0 min-w-0 basis-0 transition-[flex-grow] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{ flexGrow: active ? OPEN : 1, ["--light" as string]: light }}
      // Each strip rises into place like a curtain going up, left to right.
      initial={{ clipPath: "inset(100% 0% 0% 0% round 20px)" }}
      animate={{ clipPath: revealed ? "inset(0% 0% 0% 0% round 20px)" : "inset(100% 0% 0% 0% round 20px)" }}
      transition={reduce ? { duration: 0 } : { duration: 0.9, delay: index * 0.08, ease }}
    >
      <button
        type="button"
        aria-expanded={active}
        aria-label={label}
        onPointerEnter={(e) => e.pointerType === "mouse" && onOpen()}
        onFocus={onOpen}
        onClick={onOpen}
        className="relative block h-full w-full cursor-pointer overflow-hidden rounded-card bg-surface text-left outline-none focus-visible:ring-2 focus-visible:ring-blue/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        {/* The photo, with a slow push-in while open. Grey and dimmed while waiting. */}
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{ scale: active ? 1 : 1.08 }}
          transition={reduce ? { duration: 0 } : { duration: 1.6, ease }}
        >
          <Photo photo={speaker.photo} active={active} />
          {speaker.alt && (
            <motion.div
              className="absolute inset-0"
              initial={false}
              animate={{ opacity: altOn ? 1 : 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.9, ease: "easeInOut" }}
            >
              <Photo photo={speaker.alt} active={active} />
            </motion.div>
          )}
        </motion.div>

        {/* The stage light: a bar of the strip's colour along the top, and its wash spilling down. */}
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left"
          style={{ background: "var(--light)", boxShadow: "0 0 18px 2px var(--light)" }}
          initial={false}
          animate={{ scaleX: active ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, ease, delay: active ? 0.15 : 0 }}
        />
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(90% 55% at 50% 0%, color-mix(in srgb, var(--light) 30%, transparent), transparent 70%)" }}
          initial={false}
          animate={{ opacity: active ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, ease }}
        />

      </button>
    </motion.li>
  );
}

function Photo({ photo, active }: { photo: Speaker["photo"]; active: boolean }) {
  return (
    <Image
      src={photo.src}
      alt=""
      fill
      sizes="(min-width: 768px) 60vw, 100vw"
      className={cn("object-cover transition-[filter] duration-700", active ? "" : "brightness-[.55] grayscale")}
      style={{ objectPosition: photo.focus }}
    />
  );
}
