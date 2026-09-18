"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { EdgeExports } from "@/components/brand/EdgeExports";
import { RaysFloor } from "@/components/brand/RaysFloor";
import { Lockup, PILL } from "@/components/brand/Lockup";
import { GLOW } from "@/components/brand/slabs";
import VariableProximity from "@/components/reactbits/VariableProximity";
import Magnet from "@/components/reactbits/Magnet";
import { Button } from "@/components/ui/Button";
import { EVENT } from "@/data/event";
import { TRACKS } from "@/data/tracks";
import { useAccent } from "@/lib/accent";
import { useLoaderState } from "@/lib/loader-state";

const ease = [0.16, 1, 0.3, 1] as const;

/** True only for devices with an actual mouse: gates the proximity headline off touch/coarse pointers. */
function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return fine;
}

/** Four dots, one per track: hovering or focusing one lights the whole hero
 *  in that track's colour (edges, lockup pill, floor rays) and pauses the
 *  auto-cycle; leaving resumes it. Clicking jumps to the track. */
function TrackDots() {
  const accent = useAccent((s) => s.accent);
  const setAccent = useAccent((s) => s.setAccent);
  const setHold = useAccent((s) => s.setHold);

  return (
    <div className="flex items-center gap-3" role="group" aria-label="Preview a track">
      {TRACKS.map((t) => (
        <a
          key={t.id}
          href="#tracks"
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

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reduce = useReducedMotion();
  const finePointer = useFinePointer();
  const inView = useInView(ref, { amount: 0.2 });
  const accent = useAccent((s) => s.accent);
  const ready = useLoaderState((s) => s.done);

  // The proximity headline only turns on once ready, with motion allowed,
  // and on a device that actually has a hover-capable pointer to react to.
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
    <section ref={ref} id="top" className="relative isolate grid min-h-dvh grid-rows-[1fr_auto] overflow-hidden">
      <EdgeExports heroRef={ref} />
      {ready && <RaysFloor />}

      <div className="grid place-items-center px-5 pb-10 pt-[120px] text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={reduce ? { duration: 0 } : { duration: 0.9, ease }}
        >
          <div className="mx-auto mb-10 w-[min(400px,64vw)]">
            <Lockup pill={PILL[accent]} />
          </div>

          <h1
            ref={headingRef}
            className="display mx-auto mb-8 text-[clamp(1.8rem,5.6vw,5.4rem)] font-medium leading-[1.02]"
            aria-label="One day. Four tracks. Every builder in Delhi NCR."
          >
            <span aria-hidden="true">
              {segment("One day.")} {segment("Four tracks.", true)}
              <br />
              {segment("Every builder in Delhi NCR.")}
            </span>
          </h1>

          <motion.div
            className="flex flex-wrap items-center justify-center gap-3"
            initial={{ opacity: 0, y: 12 }}
            animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={reduce ? { duration: 0 } : { duration: 0.8, ease, delay: 0.9 }}
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
      </div>

      <motion.dl
        className="grid grid-cols-2 gap-4 px-5 pb-9 sm:grid-cols-4 md:px-10 lg:px-14"
        initial={{ opacity: 0 }}
        animate={ready ? { opacity: 1 } : { opacity: 0 }}
        transition={reduce ? { duration: 0 } : { duration: 1, delay: 1.2 }}
      >
        <div>
          <dt className="label">Date</dt>
          <dd className="label !text-text">{EVENT.dateLabel}</dd>
        </div>
        <div>
          <dt className="label">Venue</dt>
          <dd className="label !text-text">
            {EVENT.venue.name}, {EVENT.venue.city}
          </dd>
        </div>
        <div className="sm:text-right">
          <dt className="label">Last year</dt>
          <dd className="label !text-text">{EVENT.counts.registered2025.toLocaleString("en-IN")}+ registered</dd>
        </div>
        <div className="sm:text-right">
          <dt className="label">Tracks</dt>
          <dd className="mt-1.5 flex sm:justify-end">
            <TrackDots />
          </dd>
        </div>
      </motion.dl>
    </section>
  );
}
