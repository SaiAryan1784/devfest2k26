"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import SplitFlapText from "@/components/reactbits/SplitFlapText";
import CountUp from "@/components/reactbits/CountUp";
import { GlassSlabs } from "@/components/brand/GlassSlabs";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EVENT } from "@/data/event";
import { countdownTo } from "@/lib/countdown";

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
 * The essentials: what is known, what is not, and what to do about it.
 *
 * A stat band rather than a bento (the floor section owns that family now):
 * the countdown runs full width as the section's anchor, and three blocks sit
 * under it divided by hairlines instead of boxed into cards. The venue block
 * is deliberately an empty state, since the 2026 venue is still unannounced,
 * and it points at the one action that resolves it.
 */
export function Essentials() {
  const reduce = useReducedMotion();
  const item = {
    initial: reduce ? false : { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.3 },
  } as const;

  return (
    <section className="py-20 md:py-24 lg:py-28">
      <Container>
        <h2 className="display mb-12 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">The essentials</h2>

        <motion.div {...item} transition={{ duration: 0.6, ease }}>
          <div className="relative isolate overflow-hidden rounded-panel border border-hair bg-surface p-7 md:p-10">
            <GlassSlabs side="right" color="blue" intensity={0.5} alive className="hidden w-[28%] opacity-50 md:block" />
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
              <p className="display text-3xl font-semibold leading-tight">{EVENT.venue.label}</p>
              <p className="mt-1 text-[15px] text-muted">{EVENT.venue.region}</p>
              <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-muted">
                The waitlist hears the venue first, along with everything else we lock in.
              </p>
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
            <GlassSlabs side="right" color="green" intensity={0.45} alive className="w-[30%] opacity-40" />
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
