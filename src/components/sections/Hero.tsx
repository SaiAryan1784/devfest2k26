"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Lockup, PILL } from "@/components/brand/Lockup";
import { GLOW } from "@/components/brand/slabs";
import VariableProximity from "@/components/reactbits/VariableProximity";
import Magnet from "@/components/reactbits/Magnet";
import { Button } from "@/components/ui/Button";
import { EVENT } from "@/data/event";
import { TRACKS } from "@/data/tracks";
import { useAccent, useAccentCycle } from "@/lib/accent";
import { useLoaderState } from "@/lib/loader-state";
import { useFinePointer } from "@/lib/use-fine-pointer";
import { HeroVideo } from "./HeroVideo";
import { STACK_STEP_PX, STACK_TOP_VH } from "./TrackStack";

const ease = [0.16, 1, 0.3, 1] as const;

/** Four dots, one per track: hovering or focusing one lights the lockup pill
 *  in that track's colour and pauses the auto-cycle; leaving resumes it.
 *  Clicking jumps to that track's card in the pinned stack below. */
function TrackDots() {
  const reduce = useReducedMotion();
  const accent = useAccent((s) => s.accent);
  const setAccent = useAccent((s) => s.setAccent);
  const setHold = useAccent((s) => s.setHold);

  return (
    <div className="flex items-center gap-3" role="group" aria-label="Preview a track">
      {TRACKS.map((t, i) => (
        <a
          key={t.id}
          href="#tracks"
          onClick={(e) => {
            const el = document.getElementById(`track-${t.id}`);
            // Tracks sits behind a LazyMount; if it hasn't mounted yet (rare:
            // its 800px root margin means this is normally instant), fall
            // through to the native #tracks jump plus AnchorFix's realignment
            // instead of scrolling nowhere.
            if (!el) return;
            e.preventDefault();
            setAccent(t.color);
            const desktop = window.matchMedia("(min-width: 1024px)").matches;
            const offset = desktop ? window.innerHeight * (STACK_TOP_VH / 100) + i * STACK_STEP_PX : 96;
            const targetY = window.scrollY + el.getBoundingClientRect().top - offset;
            window.scrollTo({ top: targetY, behavior: reduce ? "auto" : "smooth" });
          }}
          onMouseEnter={() => {
            setAccent(t.color);
            setHold(true);
          }}
          onFocus={() => {
            setAccent(t.color);
            setHold(true);
          }}
          onMouseLeave={() => setHold(false)}
          onBlur={() => setHold(false)}
          aria-label={`${t.name} track`}
          className="relative grid size-6 shrink-0 place-items-center"
        >
          <span
            aria-hidden="true"
            className="block size-[10px] rounded-full transition-transform duration-300 hover:scale-125"
            style={{ background: GLOW[t.color] }}
          />
          {accent === t.color && (
            <motion.span
              aria-hidden="true"
              layoutId="hero-track-dot-ring"
              className="absolute inset-0 rounded-full"
              style={{ boxShadow: `0 0 0 1.5px ${GLOW[t.color]}, 0 0 12px 2px ${GLOW[t.color]}80` }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
            />
          )}
        </a>
      ))}
    </div>
  );
}

/**
 * The billboard: the silent loop fills the hero, the copy sits in one left
 * column over its scrim, the way a title page does. The lockup is the glide's
 * target (`data-hero-lockup`), so it must already rest where it belongs while
 * it fades in.
 */
export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reduce = useReducedMotion();
  const finePointer = useFinePointer();
  const inView = useInView(ref, { amount: 0.2 });
  const accent = useAccent((s) => s.accent);
  const ready = useLoaderState((s) => s.done);
  const showing = useLoaderState((s) => s.showing);
  useAccentCycle(Boolean(ready && inView && !reduce));
  // Hidden only while the loader is running its sequence. Before that the hero
  // is painted under the opaque gate, so the browser records the LCP at first
  // paint; on the skip path it is never hidden and the gate's dissolve is the
  // entrance. Both store defaults are false on the server and the client.
  const hidden = showing && !ready;

  const enhanceHeadline = ready && !reduce && finePointer;

  const segment = (text: string, emphasis = false) => {
    const content = enhanceHeadline ? (
      <VariableProximity
        label={text}
        containerRef={headingRef}
        radius={140}
        falloff={emphasis ? "gaussian" : "linear"}
        fromFontVariationSettings={emphasis ? "'wdth' 128, 'wght' 640" : "'wdth' 100, 'wght' 500"}
        toFontVariationSettings={emphasis ? "'wdth' 140, 'wght' 760" : "'wdth' 118, 'wght' 640"}
      />
    ) : (
      text
    );
    return emphasis ? <span className="display-em">{content}</span> : content;
  };

  return (
    <section ref={ref} id="top" className="relative isolate grid min-h-dvh overflow-hidden">
      <HeroVideo heroRef={ref} />

      <div className="grid min-h-dvh items-end px-5 pb-12 pt-[120px] md:items-center md:px-10 md:pb-16 lg:px-14">
        <div className="w-full max-w-[820px]">
          {/* Opacity only, no rise: the loader glides its own copy of the lockup onto this one. */}
          <motion.div
            data-hero-lockup
            className="mb-7 w-[min(300px,58vw)] md:mb-9"
            initial={false}
            animate={{ opacity: hidden ? 0 : 1 }}
            transition={reduce || hidden ? { duration: 0 } : { duration: 0.9, ease }}
          >
            <Lockup pill={PILL[accent]} />
          </motion.div>

          <motion.div
            initial={false}
            animate={hidden ? { opacity: 0, y: 16 } : { opacity: 1, y: 0 }}
            transition={reduce || hidden ? { duration: 0 } : { duration: 0.9, ease }}
          >
            <h1
              ref={headingRef}
              className="display mb-5 text-[clamp(1.7rem,3.7vw,3.8rem)] font-medium leading-[1.04]"
              aria-label="One day. Four tracks. Every builder in Delhi NCR."
            >
              <span aria-hidden="true">
                {segment("One day.")} {segment("Four tracks.", true)}
                <br />
                {segment("Every builder in Delhi NCR.")}
              </span>
            </h1>
            <p className="mb-8 max-w-[52ch] text-[15px] leading-relaxed text-text/80 md:text-[17px]">{EVENT.hero.description}</p>

            <motion.div
              className="flex flex-wrap items-center gap-3"
              initial={false}
              animate={hidden ? { opacity: 0, y: 12 } : { opacity: 1, y: 0 }}
              transition={reduce || hidden ? { duration: 0 } : { duration: 0.8, ease, delay: 0.9 }}
            >
              <Magnet padding={60} magnetStrength={6} disabled={!inView || !!reduce}>
                <Button href={EVENT.links.waitlist}>{EVENT.cta.primary}</Button>
              </Magnet>
              <Magnet padding={60} magnetStrength={6} disabled={!inView || !!reduce}>
                <Button href="#tracks" variant="ghost">
                  {EVENT.cta.secondary}
                </Button>
              </Magnet>
            </motion.div>
          </motion.div>

          {/* The facts as one metadata line, the way a title page lists year, seasons and rating. */}
          <motion.dl
            className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 md:mt-12"
            initial={false}
            animate={{ opacity: hidden ? 0 : 1 }}
            transition={reduce || hidden ? { duration: 0 } : { duration: 1, delay: 1.2 }}
          >
            <div className="flex items-baseline gap-2">
              <dt className="label">Date</dt>
              <dd className="label !text-text">{EVENT.dateLabel}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="label">Venue</dt>
              <dd className="label !text-text">{EVENT.venue.shortLabel}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="label">Last year</dt>
              <dd className="label !text-text">{EVENT.counts.registered2025.toLocaleString("en-IN")}+ registered</dd>
            </div>
            <div className="flex items-center gap-3">
              <dt className="label">Tracks</dt>
              <dd className="flex">
                <TrackDots />
              </dd>
            </div>
          </motion.dl>
        </div>
      </div>
    </section>
  );
}
