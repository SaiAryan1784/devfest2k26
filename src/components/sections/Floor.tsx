"use client";

import { motion, useReducedMotion } from "motion/react";
import ScrollReveal from "@/components/reactbits/ScrollReveal";
import { LightPipe } from "@/components/brand/LightPipe";
import type { PipeShape } from "@/components/brand/pipes";
import { GLOW } from "@/components/brand/slabs";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EVENT } from "@/data/event";
import { FLOOR, FLOOR_INTRO, type FloorItem } from "@/data/floor";
import type { TrackColor } from "@/data/event";
import { cn } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;

// Presentation only, so it stays out of the data file: the floor cycles the
// four brand colours so nine tiles never read as one grey block.
const ACCENTS: Exclude<TrackColor, "spectrum">[] = ["blue", "green", "yellow", "red"];
const accentOf = (i: number) => ACCENTS[i % ACCENTS.length];

/**
 * Everything on the floor beyond the four tracks: a uniform grid of nine
 * identical tiles (the two new-for-2026 items keep their prominence through
 * a chip, not a bigger card), closing on a link to the floor's own
 * registration form.
 */
export function Floor() {
  const reduce = useReducedMotion();

  return (
    <section className="py-20 md:py-24 lg:py-28">
      <Container>
        <h2 className="display mb-4 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">
          <em className="display-em">…and the floor.</em>
        </h2>
        {/* The intro resolves word by word as the section opens, so the floor
            arrives as a list of things rather than a wall of copy. Blur is off:
            its default scrubs a filter per word, which this page does not do on
            scroll. */}
        <ScrollReveal
          as="div"
          enableBlur={false}
          baseOpacity={0.12}
          baseRotation={1.5}
          containerClassName="mb-12 max-w-[46ch]"
          textClassName="!text-[clamp(1.1rem,1.9vw,1.45rem)] !font-normal !leading-relaxed text-muted"
        >
          {FLOOR_INTRO}
        </ScrollReveal>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FLOOR.map((item, i) => (
            <Tile key={item.id} item={item} index={i} reduce={!!reduce} />
          ))}
        </ul>

        <div className="mt-10 flex justify-center">
          <Button href={EVENT.links.floorRegistration}>Register for the floor</Button>
        </div>
      </Container>
    </section>
  );
}

function Tile({ item, index, reduce }: { item: FloorItem; index: number; reduce: boolean }) {
  const accent = accentOf(index);
  const glow = GLOW[accent];

  return (
    <motion.li
      className="group relative"
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.55, delay: (index % 3) * 0.05, ease }}
      style={{ ["--glow" as string]: glow }}
    >
      <motion.article
        tabIndex={0}
        whileHover={reduce ? undefined : { y: -4 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className={cn(
          "glass relative isolate flex h-full flex-col overflow-hidden rounded-card p-6 outline-offset-4",
          "transition-[border-color,box-shadow] duration-500",
          "hover:border-[color-mix(in_srgb,var(--glow)_45%,transparent)] focus-within:border-[color-mix(in_srgb,var(--glow)_45%,transparent)]",
          "hover:shadow-[0_0_40px_-16px_var(--glow)] focus-within:shadow-[0_0_40px_-16px_var(--glow)]",
        )}
      >
        {/* A wash of the tile's colour along its lit edge. Static gradient,
            revealed on hover with opacity only. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-within:opacity-100"
          style={{ background: `radial-gradient(70% 60% at 100% 0%, color-mix(in srgb, ${glow} 22%, transparent), transparent 70%)` }}
        />

        <div className="flex items-start justify-between gap-3">
          <Glyph glyph={item.glyph} color={accent} />
          {item.isNew && (
            <span className="label shrink-0 rounded-pill border border-hair px-2.5 py-1 !text-text">New for 2026</span>
          )}
        </div>

        <p className="label mb-2 mt-5">{item.kind}</p>
        <h3 className="display mb-2 text-xl font-semibold leading-tight">{item.title}</h3>
        <p className="text-[15px] leading-snug text-text/90">{item.tagline}</p>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{item.description}</p>
      </motion.article>
    </motion.li>
  );
}

/** Small light-pipe mark in a chip: dimmed at rest, the tile's own colour at full on hover or focus. */
function Glyph({ glyph, color }: { glyph: PipeShape; color: Exclude<TrackColor, "spectrum"> }) {
  return (
    <div className="relative size-12 shrink-0 rounded-[14px] border border-hair bg-canvas p-1.5">
      <LightPipe
        shape={glyph}
        color={color}
        className="h-full w-full opacity-60 transition-[opacity,transform] duration-700 ease-out group-hover:scale-105 group-hover:opacity-100 group-focus-within:opacity-100"
      />
    </div>
  );
}
