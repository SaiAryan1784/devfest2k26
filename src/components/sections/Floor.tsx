"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { GLOW } from "@/components/brand/slabs";
import { Container } from "@/components/ui/Container";
import { FLOOR, type FloorItem } from "@/data/floor";
import type { TrackColor } from "@/data/event";
import { cn } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;

// Presentation only, so it stays out of the data file: the floor cycles the
// four brand colours so nine tiles never read as one grey block.
const ACCENTS: Exclude<TrackColor, "spectrum">[] = ["blue", "green", "yellow", "red"];
const accentOf = (i: number) => ACCENTS[i % ACCENTS.length];

/**
 * Everything on the floor beyond the four tracks. A bento of three tile sizes
 * (two features, six standard, one wide) rather than a uniform grid of nine
 * identical cards: the two things that are new in 2026 lead, the rest fill in
 * under them, and the floor closes on the photo-ops banner.
 */
export function Floor() {
  const reduce = useReducedMotion();

  return (
    <section className="py-24 md:py-32 lg:py-40">
      <Container>
        <h2 className="display mb-4 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">
          <em className="display-em">…and the floor.</em>
        </h2>
        <p className="mb-12 max-w-[52ch] text-[17px] leading-relaxed text-muted">
          Between sessions the floor is the programme: hack spaces, booths, a robot track, creators recording live, and community demos on open display all day.
        </p>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {FLOOR.map((item, i) => (
            <Tile key={item.id} item={item} index={i} reduce={!!reduce} />
          ))}
        </ul>
      </Container>
    </section>
  );
}

function Tile({ item, index, reduce }: { item: FloorItem; index: number; reduce: boolean }) {
  const accent = accentOf(index);
  const glow = GLOW[accent];
  // Two features lead, the last tile runs full width, the rest are standard.
  const size = index < 2 ? "feature" : index === FLOOR.length - 1 ? "wide" : "standard";

  return (
    <motion.li
      className={cn(
        "group relative",
        size === "feature" && "lg:col-span-3",
        size === "standard" && "lg:col-span-2",
        size === "wide" && "sm:col-span-2 lg:col-span-6",
      )}
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
          "glass relative isolate flex h-full flex-col overflow-hidden rounded-card outline-offset-4",
          "transition-[border-color,box-shadow] duration-500",
          "hover:border-[color-mix(in_srgb,var(--glow)_45%,transparent)] focus-within:border-[color-mix(in_srgb,var(--glow)_45%,transparent)]",
          "hover:shadow-[0_0_40px_-16px_var(--glow)] focus-within:shadow-[0_0_40px_-16px_var(--glow)]",
          size === "feature" ? "min-h-[220px] p-7 lg:min-h-[260px] lg:p-9" : "p-6",
          size === "wide" && "sm:flex-row sm:items-center sm:justify-between sm:gap-8",
        )}
      >
        {/* A wash of the tile's colour along its lit edge. Static gradient,
            revealed on hover with opacity only. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-within:opacity-100"
          style={{ background: `radial-gradient(70% 60% at 100% 0%, color-mix(in srgb, ${glow} 22%, transparent), transparent 70%)` }}
        />

        {size === "feature" ? (
          <>
            {/* The mark sits large and bleeding off the corner on features. */}
            <div className="pointer-events-none absolute -right-8 -top-8 size-48 opacity-60 transition-[opacity,transform] duration-700 ease-out group-hover:scale-105 group-hover:opacity-85 lg:size-60">
              <Image
                src={`/brand/glyphs/${item.glyph}.webp`}
                alt=""
                fill
                sizes="240px"
                className="object-contain [mask-image:radial-gradient(72%_72%_at_35%_65%,#000,transparent)]"
              />
            </div>
            <span className="label mb-auto w-fit rounded-pill border border-hair px-3 py-1.5 !text-text">{item.kind}</span>
            <h3 className="display mt-6 text-[clamp(1.6rem,2.6vw,2.2rem)] font-semibold leading-tight">{item.title}</h3>
            <p className="mt-3 max-w-[38ch] text-[15px] leading-relaxed text-muted">{item.description}</p>
          </>
        ) : size === "wide" ? (
          <>
            <div className="flex items-center gap-5">
              <Glyph glyph={item.glyph} />
              <div>
                <p className="label mb-2">{item.kind}</p>
                <h3 className="display text-2xl font-semibold leading-tight">{item.title}</h3>
              </div>
            </div>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted sm:mt-0 sm:text-right">{item.description}</p>
          </>
        ) : (
          <>
            <Glyph glyph={item.glyph} />
            <p className="label mb-2 mt-5">{item.kind}</p>
            <h3 className="display mb-2 text-xl font-semibold leading-tight">{item.title}</h3>
            <p className="text-[15px] leading-relaxed text-muted">{item.description}</p>
          </>
        )}
      </motion.article>
    </motion.li>
  );
}

/** Small glyph mark: grey at rest, the tile's own colour on hover or focus. */
function Glyph({ glyph }: { glyph: string }) {
  return (
    <div className="relative size-12 shrink-0 overflow-hidden rounded-[14px] border border-hair bg-canvas">
      <Image
        src={`/brand/glyphs/${glyph}.webp`}
        alt=""
        fill
        sizes="48px"
        className="object-cover grayscale-[.55] brightness-125 transition-[filter,transform] duration-700 ease-out group-hover:scale-105 group-hover:grayscale-0 group-focus-within:grayscale-0"
      />
    </div>
  );
}
