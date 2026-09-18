"use client";

import { useEffect, useState, type PointerEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import SplitFlapText from "@/components/reactbits/SplitFlapText";
import CountUp from "@/components/reactbits/CountUp";
import { GlassSlabs } from "@/components/brand/GlassSlabs";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EVENT } from "@/data/event";
import { countdownTo } from "@/lib/countdown";
import { cn } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;

/** Bento cell with a pointer-tracked spotlight on its border. */
function Cell({ className, children }: { className?: string; children: React.ReactNode }) {
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div
      onPointerMove={onMove}
      className={cn(
        "group relative isolate overflow-hidden rounded-panel border border-hair bg-surface p-7 md:p-9",
        "before:pointer-events-none before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-500 before:content-[''] group-hover:before:opacity-100 hover:before:opacity-100",
        "before:[background:radial-gradient(420px_circle_at_var(--mx,50%)_var(--my,50%),rgba(255,255,255,.07),transparent_60%)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

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
    <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
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
            gap={4}
            fontSize="clamp(1.8rem, 4vw, 3rem)"
            aria-label={`${value} ${label}`}
          />
          <p className="label mt-3">{label}</p>
        </div>
      ))}
    </div>
  );
}

export function Essentials() {
  const reduce = useReducedMotion();
  const item = {
    initial: reduce ? false : { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.3 },
  } as const;

  return (
    <section className="py-24 md:py-32 lg:py-40">
      <Container>
        <h2 className="display mb-12 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">The essentials</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <motion.div {...item} transition={{ duration: 0.6, ease }} className="md:col-span-2">
            <Cell className="h-full">
              <GlassSlabs side="right" color="blue" intensity={0.5} className="hidden w-[30%] opacity-50 md:block" />
              {/* `relative` keeps the copy above the slab: GlassSlabs is absolutely
                  positioned, and positioned elements paint over static ones whatever
                  the DOM order. */}
              <div className="relative md:pr-[32%]">
                <p className="label mb-6">Doors open {EVENT.dateLabel}</p>
                <Countdown />
              </div>
            </Cell>
          </motion.div>

          <motion.div {...item} transition={{ duration: 0.6, ease, delay: 0.08 }}>
            <Cell className="flex h-full flex-col justify-between gap-8">
              <div>
                <p className="label mb-3">Tickets</p>
                <p className="display text-3xl font-semibold leading-tight">Waitlist open</p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">Tickets are announced to the waitlist first.</p>
              </div>
              <Button href={EVENT.links.waitlist} className="w-full">
                {EVENT.cta.primary}
              </Button>
            </Cell>
          </motion.div>

          <motion.div {...item} transition={{ duration: 0.6, ease, delay: 0.16 }} className="md:col-span-2">
            <Cell className="!p-0">
              <iframe
                title={`Map to ${EVENT.venue.name}`}
                src={EVENT.venue.mapsEmbedUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-[320px] w-full grayscale invert-[.92] hue-rotate-180 contrast-[.9] md:h-full md:min-h-[360px]"
              />
              <div className="glass-live absolute bottom-5 left-5 right-5 rounded-card p-5 md:right-auto md:max-w-[360px]">
                <p className="display text-2xl font-semibold leading-tight">
                  {EVENT.venue.name}, {EVENT.venue.city}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{EVENT.venue.address}</p>
                <a href={EVENT.venue.mapsLink} target="_blank" rel="noopener" className="mt-3 inline-block text-sm font-medium underline-offset-4 hover:underline">
                  Open in Google Maps<span className="sr-only"> (opens in new tab)</span>
                </a>
              </div>
            </Cell>
          </motion.div>

          <motion.div {...item} transition={{ duration: 0.6, ease, delay: 0.24 }}>
            <Cell className="flex h-full flex-col justify-end">
              {/* Right side and narrower: the copy owns the left of the cell, so
                  the number never sits on top of the lit slabs. */}
              <GlassSlabs side="right" color="green" intensity={0.5} className="w-[32%] opacity-50" />
              <div className="relative pr-[30%]">
                <p className="label mb-3">Last year</p>
                <p className="display text-[clamp(2.6rem,5vw,4rem)] font-semibold leading-none text-text">
                  <CountUp to={EVENT.counts.registered2025} separator="," duration={1.6} />+
                </p>
                <p className="mt-2 text-[15px] text-muted">registered, {EVENT.counts.speakers2025}+ speakers on stage</p>
              </div>
            </Cell>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
