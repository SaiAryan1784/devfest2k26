"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { BellRinging, Check, Checks } from "@phosphor-icons/react";
import { GLOW, PAL } from "@/components/brand/slabs";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Countdown, useIsPast } from "@/components/ui/Countdown";
import { TICKETS, TICKETS_INTRO, TICKET_SALE, type Ticket } from "@/data/tickets";
import { ICS_PATH, googleCalendarUrl } from "@/lib/early-bird-reminder";
import { cn } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;
const REMIND =
  "glass-pill inline-flex h-9 items-center rounded-pill px-4 text-[13px] font-medium text-text transition-colors duration-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue";
// The palette has no separate gold token: on the canvas's near-black, the
// existing yellow ramp already reads as gold. See slabs.ts.
const GOLD = PAL.yellow;

/**
 * Two passes, side by side, with the early bird sale running above them.
 * Opaque surface panels rather than `.glass` tiles: the floor's bento owns
 * the glass-tile family, and nothing moves behind these, so a blur would be
 * paying for nothing (see the .glass / .glass-live note in globals.css).
 *
 * Sits directly under the billboard and mounts eagerly (no LazyMount): at
 * scroll 0 it is already inside LazyMount's 800px root margin, so a wrapper
 * could only reserve a wrong height for no gain.
 */
export function Tickets() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { amount: 0.15 });
  // Null until mounted: render the "opens soon" state until the reader's clock says otherwise.
  const open = useIsPast(TICKET_SALE.opensAt) === true;

  return (
    <section ref={ref} id="tickets" className="py-20 md:py-24 lg:py-28">
      <Container>
        <div className="mb-10 flex flex-col gap-5 md:mb-12 md:flex-row md:items-end md:justify-between">
          <h2 className="display text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">Get your pass.</h2>
          <p className="max-w-[38ch] text-[15px] leading-relaxed text-muted">{TICKETS_INTRO}</p>
        </div>

        {/* The sale strip: counts down to the early bird opening, then says it's live. */}
        <div className="reveal mb-4 flex flex-col gap-7 rounded-panel border border-hair bg-surface px-6 py-6 md:flex-row md:items-center md:justify-between md:gap-10 md:px-9 md:py-7">
          <div>
            <p className="label flex items-center gap-2.5 !text-text">
              <motion.span
                aria-hidden="true"
                className={cn("inline-block size-2 shrink-0 rounded-full", open ? "bg-green" : "bg-yellow")}
                style={{ boxShadow: `0 0 10px 2px ${open ? GLOW.green : GLOW.yellow}80` }}
                initial={false}
                animate={{ opacity: reduce || !inView ? 1 : [1, 0.35, 1] }}
                transition={reduce || !inView ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
              {TICKET_SALE.label} {open ? "is live" : "opens soon"}
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              {open ? "Opened" : "Opens"} {TICKET_SALE.opensLabel}.
            </p>
            {!open && (
              // A calendar invite is the reminder: it works on every phone and
              // laptop, needs no sign-up, and alerts at 8:50 and 9 PM IST.
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <span className="mr-1 flex items-center gap-2 text-[13px] text-muted">
                  <BellRinging aria-hidden="true" size={16} className="text-yellow-hi" />
                  Remind me at 9 PM
                </span>
                <a href={googleCalendarUrl()} target="_blank" rel="noopener" className={REMIND}>
                  Google Calendar<span className="sr-only"> (opens in new tab)</span>
                </a>
                <a href={ICS_PATH} download="devfest-noida-early-bird.ics" className={REMIND}>
                  Apple or Outlook
                </a>
              </div>
            )}
          </div>

          {!open && (
            <Countdown
              to={TICKET_SALE.opensAt}
              label={`${TICKET_SALE.label} opens in`}
              variant="flap"
              size="sm"
              units={["days", "hours", "minutes", "seconds"]}
              active={inView}
            />
          )}
        </div>

        {/* Deliberately uneven: a pair that tilts toward the pass the
            page is pushing, rather than two identical columns. */}
        <div className="grid gap-4 lg:grid-cols-[1.12fr_1fr]">
          {TICKETS.map((ticket, i) => (
            <TicketCard key={ticket.id} ticket={ticket} index={i} reduce={!!reduce} />
          ))}
        </div>
      </Container>
    </section>
  );
}

function TicketCard({ ticket, index, reduce }: { ticket: Ticket; index: number; reduce: boolean }) {
  const gold = ticket.featured;

  return (
    <motion.article
      className={cn(
        "reveal relative isolate flex flex-col overflow-hidden rounded-panel border bg-surface p-7 transition-colors duration-500 md:p-9 lg:p-10",
        gold ? "border-yellow/25 hover:border-yellow/45" : "border-hair",
      )}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={reduce ? { duration: 0 } : { duration: 0.6, delay: index * 0.08, ease }}
    >
      {gold && (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-x-[10%] top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${GOLD.hi}, transparent)` }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 -z-10 size-72 rounded-full"
            style={{ background: `radial-gradient(closest-side, ${GOLD.mid}2e, transparent)` }}
          />
        </>
      )}

      <p className={cn("label w-fit rounded-pill border px-3 py-1.5", gold ? "border-yellow/35 !text-yellow-hi" : "border-hair !text-text")}>
        {ticket.kind}
      </p>

      <h3 className="display mt-5 text-[clamp(1.5rem,2.4vw,2rem)] font-semibold leading-tight">{ticket.name}</h3>
      <p className="mt-2 max-w-[34ch] text-[15px] leading-relaxed text-muted">{ticket.summary}</p>

      <ul className="mt-8 space-y-3.5 border-t border-hair pt-8">
        {ticket.builtOn && (
          // The lead-in: this pass stacks on the other one, so say that once
          // instead of repeating its perks. Double check, and full-strength
          // text, so it reads as the frame for the list below it.
          <li className="flex items-start gap-3 text-[15px] font-medium leading-relaxed text-text">
            <Checks aria-hidden="true" size={18} weight="regular" className="mt-[3px] shrink-0 text-yellow-hi" />
            {ticket.builtOn}:
          </li>
        )}
        {ticket.includes.map((line) => (
          <li key={line} className="flex items-start gap-3 text-[15px] leading-relaxed text-text/85">
            <Check aria-hidden="true" size={18} weight="regular" className={cn("mt-[3px] shrink-0", gold ? "text-yellow-hi" : "text-muted")} />
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-9">
        <Button href={ticket.cta.href} variant={gold ? "primary" : "ghost"} className="w-full">
          {ticket.cta.label}
        </Button>
      </div>
    </motion.article>
  );
}
