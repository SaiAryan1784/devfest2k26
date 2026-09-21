"use client";

import { useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { Spotlight, SpotlightPool } from "@/components/brand/Spotlight";
import { Container } from "@/components/ui/Container";
import { SPEAKERS_2025 } from "@/data/speakers";
import { EVENT } from "@/data/event";
import { cn } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;

type AccentKey = "blue" | "red" | "yellow" | "green";

const ACCENTS: AccentKey[] = ["blue", "red", "yellow", "green"];

const ACCENT_STYLES: Record<
  AccentKey,
  {
    border: string;
    glow: string;
    tagBorder: string;
    tagBg: string;
    cornerGlow: string;
    dot: string;
  }
> = {
  blue: {
    border: "rgba(66, 133, 244, 0.45)",
    glow: "rgba(66, 133, 244, 0.28)",
    tagBorder: "border-blue/30",
    tagBg: "bg-blue/10 text-blue-hi",
    cornerGlow: "from-blue/15",
    dot: "bg-blue",
  },
  red: {
    border: "rgba(234, 67, 53, 0.45)",
    glow: "rgba(234, 67, 53, 0.28)",
    tagBorder: "border-red/30",
    tagBg: "bg-red/10 text-red-hi",
    cornerGlow: "from-red/15",
    dot: "bg-red",
  },
  yellow: {
    border: "rgba(251, 188, 4, 0.45)",
    glow: "rgba(251, 188, 4, 0.28)",
    tagBorder: "border-yellow/30",
    tagBg: "bg-yellow/10 text-yellow-hi",
    cornerGlow: "from-yellow/15",
    dot: "bg-yellow",
  },
  green: {
    border: "rgba(52, 168, 83, 0.45)",
    glow: "rgba(52, 168, 83, 0.28)",
    tagBorder: "border-green/30",
    tagBg: "bg-green/10 text-green-hi",
    cornerGlow: "from-green/15",
    dot: "bg-green",
  },
};

/**
 * Speakers archive and stage showcase.
 *
 * Typographic, architectural presentation of DevFest speakers:
 * - Clean focus on names, roles, and company affiliations (zero profile pictures).
 * - Full responsive balance: clean 1-column layout on mobile, 2 columns on tablet,
 *   and 4 columns on desktop without horizontal clipping or scroll traps.
 * - Stage spotlight tracks hovered/focused cards on desktop and provides atmospheric
 *   stage backlighting on mobile.
 * - Google four-color accents cycle subtly across cards.
 */
export function Stage() {
  const reduce = useReducedMotion();
  const gridRef = useRef<HTMLUListElement>(null);
  const target = useMotionValue(0);
  const x = useSpring(target, { stiffness: 70, damping: 18, mass: 0.8 });
  const [lit, setLit] = useState<number | null>(null);

  const aim = (el: HTMLElement | null, i: number) => {
    if (reduce || !el || !gridRef.current) return;
    setLit(i);
    const g = gridRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    target.set(r.left + r.width / 2 - (g.left + g.width / 2));
  };

  const reset = () => {
    setLit(null);
    target.set(0);
  };

  return (
    <section className="relative isolate overflow-hidden pt-20 md:pt-24 lg:pt-28">
      {/* Dark radial room vignette keeping the spotlight focused on the stage */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: "radial-gradient(80% 70% at 50% 30%, transparent 35%, rgba(0,0,0,.7) 100%)",
        }}
      />

      <Container className="relative">
        {/* Section Header */}
        <div className="mb-12 md:mb-16">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="label">Stage archive · 2025 voices</p>
            <div className="glass-pill inline-flex items-center gap-2 px-3 py-1 text-[11px] font-mono uppercase tracking-widest text-muted">
              <span className="size-1.5 rounded-full bg-yellow animate-pulse" />
              <span>2026 lineup announced soon</span>
            </div>
          </div>

          <h2 className="display mb-4 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">
            Last year&apos;s stage.
          </h2>

          <p className="max-w-[48ch] text-[clamp(1rem,1.8vw,1.25rem)] text-muted leading-relaxed">
            The engineers, architects, and designers who headlined our stage. Our 2026 speaker lineup is currently in curation.
          </p>
        </div>

        {/* The Stage Rig: Spotlight and floor pool */}
        <div className="relative">
          <Spotlight x={x} />
          <SpotlightPool x={x} />

          {/* Speakers Responsive Grid */}
          <ul
            ref={gridRef}
            onMouseLeave={reset}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) reset();
            }}
            className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {SPEAKERS_2025.map((s, i) => {
              const accentKey = ACCENTS[i % ACCENTS.length];
              const accent = ACCENT_STYLES[accentKey];
              const isCardLit = lit === i;
              const formattedIndex = String(i + 1).padStart(2, "0");

              return (
                <motion.li
                  key={s.name}
                  className="w-full"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{
                    duration: reduce ? 0 : 0.5,
                    delay: reduce ? 0 : (i % 4) * 0.05,
                    ease,
                  }}
                >
                  <motion.div
                    tabIndex={0}
                    onMouseEnter={(e) => aim(e.currentTarget, i)}
                    onFocus={(e) => aim(e.currentTarget, i)}
                    animate={{
                      opacity: lit === null || isCardLit ? 1 : 0.65,
                      boxShadow: isCardLit
                        ? `0 0 0 1px ${accent.border}, 0 16px 40px -10px ${accent.glow}`
                        : "0 0 0 1px rgba(255,255,255,0), 0 0 0px 0px rgba(0,0,0,0)",
                    }}
                    whileHover={{ y: -4 }}
                    transition={{
                      duration: reduce ? 0 : 0.24,
                      ease,
                    }}
                    className="glass !bg-surface/90 group relative flex min-h-[160px] flex-col justify-between overflow-hidden rounded-card p-5 sm:p-6 transition-colors focus:outline-none"
                  >
                    {/* Subtle corner colored glow on active/hover */}
                    <div
                      aria-hidden="true"
                      className={cn(
                        "pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-gradient-to-br to-transparent opacity-0 blur-2xl transition-opacity duration-300",
                        accent.cornerGlow,
                        isCardLit && "opacity-100"
                      )}
                    />

                    {/* Card Header: Index number and Company pill */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium tracking-widest text-muted/70 group-hover:text-muted transition-colors">
                        {formattedIndex}
                      </span>

                      {s.company ? (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-pill border px-2.5 py-0.5 text-[11px] font-mono font-medium tracking-wider transition-colors",
                            accent.tagBorder,
                            accent.tagBg
                          )}
                        >
                          {s.company}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-pill border border-white/5 bg-white/[0.03] px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-muted/60">
                          <span className={cn("size-1 rounded-full", accent.dot)} />
                          Keynote
                        </span>
                      )}
                    </div>

                    {/* Card Body: Speaker Name and Role */}
                    <div className="mt-6">
                      <h3 className="display text-lg sm:text-xl font-semibold tracking-[-0.02em] text-white leading-tight">
                        {s.name}
                      </h3>
                      <p className="mt-1.5 text-sm leading-snug text-muted group-hover:text-neutral-300 transition-colors">
                        {s.role}
                      </p>
                    </div>

                    {/* Ambient bottom accent hairline */}
                    <div
                      aria-hidden="true"
                      className={cn(
                        "pointer-events-none absolute inset-x-4 bottom-0 h-px transition-opacity duration-300",
                        accent.dot,
                        isCardLit ? "opacity-70" : "opacity-0"
                      )}
                    />
                  </motion.div>
                </motion.li>
              );
            })}
          </ul>
        </div>

        {/* 2026 Call for Proposals / Stay Updated Callout */}
        <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-card border border-white/10 bg-surface/60 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-2 rounded-full bg-green animate-pulse" />
            <div>
              <p className="text-sm font-medium text-white/95">
                Want to take the stage at DevFest Noida 2026?
              </p>
              <p className="text-xs text-muted">
                Speaker proposals and keynote announcements will open soon.
              </p>
            </div>
          </div>

          <a
            href={EVENT.links.waitlist}
            target="_blank"
            rel="noreferrer"
            className="glass-pill inline-flex items-center gap-2 px-4 py-2 text-xs font-mono uppercase tracking-wider text-muted hover:text-white transition-colors"
          >
            <span>Join the waitlist</span>
            <ArrowUpRight size={14} />
          </a>
        </div>
      </Container>

      {/* Spacing for stage floor light pool */}
      <div aria-hidden="true" className="h-[10vh]" />
    </section>
  );
}
