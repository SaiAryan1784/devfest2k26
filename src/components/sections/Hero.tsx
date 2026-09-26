"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import VariableProximity from "@/components/reactbits/VariableProximity";
import Magnet from "@/components/reactbits/Magnet";
import { Button } from "@/components/ui/Button";
import { Countdown, useIsPast } from "@/components/ui/Countdown";
import { EVENT } from "@/data/event";
import { TICKET_SALE } from "@/data/tickets";
import { useAccentCycle } from "@/lib/accent";
import { useLoaderState } from "@/lib/loader-state";
import { useFinePointer } from "@/lib/use-fine-pointer";
import { HeroVideo } from "./HeroVideo";

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * The billboard: the silent loop fills the hero, the copy sits in one left
 * column over its scrim, the way a title page does.
 *
 * The lockup itself no longer lives here (there is only one logo on the
 * page, in the nav); the loader's glide now lands on the nav's lockup
 * instead (see Loader.tsx's `measure()` and Nav.tsx's `data-lockup-target`).
 */
export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reduce = useReducedMotion();
  const finePointer = useFinePointer();
  const inView = useInView(ref, { amount: 0.2 });
  const ready = useLoaderState((s) => s.done);
  const showing = useLoaderState((s) => s.showing);
  useAccentCycle(Boolean(ready && inView && !reduce));
  // Hidden only while the loader is running its sequence. Before that the hero
  // is painted under the opaque gate, so the browser records the LCP at first
  // paint; on the skip path it is never hidden and the gate's dissolve is the
  // entrance. Both store defaults are false on the server and the client.
  const hidden = showing && !ready;
  const saleOpen = useIsPast(TICKET_SALE.opensAt) === true;

  const enhanceHeadline = ready && !reduce && finePointer;

  const segment = (text: string) =>
    enhanceHeadline ? (
      <VariableProximity
        label={text}
        containerRef={headingRef}
        radius={140}
        falloff="linear"
        fromFontVariationSettings="'wdth' 100, 'wght' 500"
        toFontVariationSettings="'wdth' 118, 'wght' 640"
      />
    ) : (
      text
    );

  return (
    <section ref={ref} id="top" className="relative isolate grid min-h-dvh overflow-hidden">
      <HeroVideo heroRef={ref} />

      <div className="grid min-h-dvh items-end px-5 pb-12 pt-[120px] md:items-center md:px-10 md:pb-16 lg:px-14">
        <div className="w-full max-w-[820px]">
          <motion.div
            initial={false}
            animate={hidden ? { opacity: 0, y: 16 } : { opacity: 1, y: 0 }}
            transition={reduce || hidden ? { duration: 0 } : { duration: 0.9, ease }}
          >
            <h1
              ref={headingRef}
              className="display mb-5 text-[clamp(1.7rem,3.7vw,3.8rem)] font-medium leading-[1.04]"
              aria-label="The future isn't watched. It's built."
            >
              <span aria-hidden="true">
                {segment("The future isn't watched.")}
                <br />
                {segment("It's built.")}
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
              <dt className="label">{saleOpen ? "Tickets" : "Early bird opens in"}</dt>
              <dd>
                {saleOpen ? (
                  <a href="#tickets" className="label !text-text underline-offset-4 hover:underline">
                    Early bird live
                  </a>
                ) : (
                  <Countdown to={TICKET_SALE.opensAt} label="Early bird ticket sale opens in" variant="inline" padDays={2} />
                )}
              </dd>
            </div>
          </motion.dl>
        </div>
      </div>
    </section>
  );
}
