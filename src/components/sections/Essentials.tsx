"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import SplitFlapText from "@/components/reactbits/SplitFlapText";
import CountUp from "@/components/reactbits/CountUp";
import { LightPipe } from "@/components/brand/LightPipe";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EVENT } from "@/data/event";
import { countdownTo } from "@/lib/countdown";

// WebGL, client only, never under reduced motion. A quieter echo of the
// final CTA's burst, brought forward: this section carries real news (the
// countdown, the venue reveal below) well before the finale.
const PrismaticBurst = dynamic(() => import("@/components/reactbits/PrismaticBurst"), { ssr: false });

const ease = [0.16, 1, 0.3, 1] as const;

function Countdown() {
  const [c, setC] = useState<ReturnType<typeof countdownTo> | null>(null);
  useEffect(() => {
    const tick = () => setC(countdownTo(EVENT.date));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const units: [string, string][] = [
    ["Days", c ? pad(c.days, 3) : "000"],
    ["Hours", c ? pad(c.hours) : "00"],
    ["Minutes", c ? pad(c.minutes) : "00"],
  ];
  return (
    <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
      {units.map(([label, value]) => (
        <div key={label}>
          <SplitFlapText
            text={value}
            charset="numeric"
            padTo={value.length}
            loop={false}
            tileColor="#121216"
            textColor="#f5f5f7"
            tileRadius={8}
            gap={5}
            fontSize="clamp(2.2rem, 5.5vw, 4rem)"
            aria-label={`${value} ${label}`}
          />
          <p className="label mt-3">{label}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * The essentials: what is known, and what to do about it.
 *
 * A stat band rather than a bento (the floor section owns that family now):
 * the countdown runs full width as the section's anchor, and three blocks sit
 * under it divided by hairlines instead of boxed into cards. The countdown
 * card carries a quieter echo of the final CTA's PrismaticBurst, since this
 * is where the confirmed venue is revealed, well before the finale.
 */
export function Essentials() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  const item = {
    initial: reduce ? false : { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.3 },
  } as const;

  return (
    <section ref={ref} className="py-20 md:py-24 lg:py-28">
      <Container>
        <h2 className="display mb-12 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">The essentials</h2>

        <motion.div {...item} transition={{ duration: 0.6, ease }}>
          <div className="relative isolate overflow-hidden rounded-panel border border-hair bg-surface p-7 md:p-10">
            {!reduce && (
              <div aria-hidden="true" className="absolute inset-0 -z-10">
                <PrismaticBurst
                  intensity={1.5}
                  speed={0.18}
                  animationType="rotate3d"
                  colors={["#4285F4", "#34A853", "#FBBC04", "#EA4335"]}
                  distort={0.4}
                  rayCount={6}
                  paused={!inView}
                  mixBlendMode="screen"
                />
              </div>
            )}
            <LightPipe shape="s-wave" color="blue" className="pointer-events-none absolute right-[4%] top-1/2 hidden w-[15%] -translate-y-1/2 opacity-60 md:block" />
            <div className="relative md:pr-[30%]">
              <p className="label mb-7">Doors open {EVENT.dateLabel}</p>
              <Countdown />
            </div>
          </div>
        </motion.div>

        <dl className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-panel border border-hair bg-hair md:grid-cols-3">
          <motion.div {...item} transition={{ duration: 0.6, ease, delay: 0.06 }} className="bg-surface p-7 md:p-9">
            <dt className="label mb-3">Venue</dt>
            <dd>
              <p className="display text-2xl font-semibold leading-tight">{EVENT.venue.label}</p>
              <p className="mt-1 text-[15px] text-muted">{EVENT.venue.address}</p>
              <a
                href={EVENT.venue.mapsLink}
                target="_blank"
                rel="noopener"
                className="mt-3 inline-block text-[15px] text-text underline-offset-4 hover:underline"
              >
                Get directions<span className="sr-only"> (opens in new tab)</span>
              </a>
              {/* Google's keyless embed needs no API key; left in its native light
                  styling inside the site's card frame rather than fought into dark. */}
              <iframe
                src={EVENT.venue.mapsEmbedUrl}
                loading="lazy"
                title={`Map to ${EVENT.venue.label}`}
                className="mt-4 h-[140px] w-full rounded-card border border-hair"
              />
            </dd>
          </motion.div>

          <motion.div
            {...item}
            transition={{ duration: 0.6, ease, delay: 0.12 }}
            className="flex flex-col justify-between gap-8 bg-surface p-7 md:p-9"
          >
            <div>
              <dt className="label mb-3">Tickets</dt>
              <dd>
                <p className="display text-3xl font-semibold leading-tight">Waitlist open</p>
                <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-muted">
                  Tickets are announced to the waitlist before anywhere else.
                </p>
              </dd>
            </div>
            <Button href={EVENT.links.waitlist} className="w-full">
              {EVENT.cta.primary}
            </Button>
          </motion.div>

          <motion.div {...item} transition={{ duration: 0.6, ease, delay: 0.18 }} className="relative isolate overflow-hidden bg-surface p-7 md:p-9">
            <LightPipe shape="arc" color="green" className="pointer-events-none absolute right-[6%] top-1/2 w-[22%] -translate-y-1/2 opacity-50" />
            <div className="relative pr-[26%]">
              <dt className="label mb-3">Last year</dt>
              <dd>
                <p className="display text-[clamp(2.4rem,4.5vw,3.4rem)] font-semibold leading-none text-text">
                  <CountUp to={EVENT.counts.registered2025} separator="," duration={1.6} />+
                </p>
                <p className="mt-2 text-[15px] text-muted">registered</p>
                <p className="mt-4 text-[15px] leading-relaxed text-muted">
                  {EVENT.counts.speakers2025}+ speakers on stage across the day.
                </p>
              </dd>
            </div>
          </motion.div>
        </dl>
      </Container>
    </section>
  );
}
