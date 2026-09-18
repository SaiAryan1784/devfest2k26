"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { EdgeExports } from "@/components/brand/EdgeExports";
import { PrismFloor } from "@/components/brand/PrismFloor";
import { Lockup, PILL } from "@/components/brand/Lockup";
import dynamic from "next/dynamic";
import Magnet from "@/components/reactbits/Magnet";
import { Button } from "@/components/ui/Button";
import { EVENT } from "@/data/event";
import { useAccent } from "@/lib/accent";
import { useLoaderState } from "@/lib/loader-state";

const ease = [0.16, 1, 0.3, 1] as const;

// GSAP + SplitText stay out of the critical chunk; plain text renders until they arrive.
const SplitText = dynamic(() => import("@/components/reactbits/SplitText"), {
  ssr: false,
  loading: () => null,
});

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const accent = useAccent((s) => s.accent);
  const ready = useLoaderState((s) => s.done);

  const split = (text: string, className = "") =>
    reduce ? (
      <span className={className}>{text}</span>
    ) : (
      <SplitText
        tag="span"
        text={text}
        className={className}
        splitType="chars"
        delay={18}
        duration={0.9}
        ease="power3.out"
        from={{ opacity: 0, y: "0.6em" }}
        to={{ opacity: 1, y: 0 }}
        threshold={0}
        rootMargin="0px"
        textAlign="center"
      />
    );

  return (
    <section ref={ref} id="top" className="relative isolate grid min-h-dvh grid-rows-[1fr_auto] overflow-hidden">
      <EdgeExports heroRef={ref} />
      {ready && <PrismFloor />}

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
            className="display mx-auto mb-8 text-[clamp(1.8rem,5.6vw,5.4rem)] font-medium leading-[1.02]"
            aria-label="One day. Four tracks. Every builder in Delhi NCR."
          >
            {ready ? (
              <span aria-hidden="true">
                {split("One day.")}{" "}
                {split("Four tracks.", "display-em")}
                <br />
                {split("Every builder in Delhi NCR.")}
              </span>
            ) : (
              <span aria-hidden="true">
                One day. <span className="display-em">Four tracks.</span>
                <br />
                Every builder in Delhi NCR.
              </span>
            )}
          </h1>

          <motion.div
            className="flex flex-wrap items-center justify-center gap-3"
            initial={{ opacity: 0, y: 12 }}
            animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={reduce ? { duration: 0 } : { duration: 0.8, ease, delay: 0.9 }}
          >
            <Magnet padding={60} magnetStrength={6} disabled={!!reduce}>
              <Button href={EVENT.links.waitlist}>{EVENT.cta.primary}</Button>
            </Magnet>
            <Magnet padding={60} magnetStrength={6} disabled={!!reduce}>
              <Button href="#tracks" variant="ghost">
                {EVENT.cta.secondary}
              </Button>
            </Magnet>
          </motion.div>
        </motion.div>
      </div>

      <motion.dl
        className="grid grid-cols-1 gap-4 px-5 pb-9 sm:grid-cols-3 md:px-10 lg:px-14"
        initial={{ opacity: 0 }}
        animate={ready ? { opacity: 1 } : { opacity: 0 }}
        transition={reduce ? { duration: 0 } : { duration: 1, delay: 1.2 }}
      >
        <div>
          <dt className="label">Date</dt>
          <dd className="label !text-text">{EVENT.dateLabel}</dd>
        </div>
        <div className="sm:text-center">
          <dt className="label">Venue</dt>
          <dd className="label !text-text">
            {EVENT.venue.name}, {EVENT.venue.city}
          </dd>
        </div>
        <div className="sm:text-right">
          <dt className="label">Last year</dt>
          <dd className="label !text-text">{EVENT.counts.registered2025.toLocaleString("en-IN")}+ registered</dd>
        </div>
      </motion.dl>
    </section>
  );
}
