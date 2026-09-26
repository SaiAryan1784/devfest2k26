"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { GLOW } from "@/components/brand/slabs";
import { Button } from "@/components/ui/Button";
import { useIsPast } from "@/components/ui/Countdown";
import { TICKET_SALE } from "@/data/tickets";
import { useLoaderState } from "@/lib/loader-state";
import { Z } from "@/lib/z";

const DISMISSED_KEY = "devfest-earlybird-live-dismissed";

/**
 * The "early bird is live" reminder, once the sale has opened. Anyone with
 * the page already open when it opens sees it arrive on its own (useIsPast
 * rechecks every 30s). Stays out of the way while the tickets section itself
 * is on screen, and never comes back once dismissed or clicked through.
 *
 * Mobile: under the nav, so it can't collide with the rocket button in the
 * bottom-right corner. Desktop: bottom-left.
 */
export function EarlyBirdToast() {
  const reduce = useReducedMotion();
  const loaderDone = useLoaderState((s) => s.done);
  const live = useIsPast(TICKET_SALE.opensAt) === true;
  // Hidden on the server and first paint; corrected from localStorage after mount.
  const [dismissed, setDismissed] = useState(true);
  const [ticketsInView, setTicketsInView] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    const el = document.getElementById("tickets");
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setTicketsInView(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  const show = live && loaderDone && !dismissed && !ticketsInView;

  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          aria-label={TICKET_SALE.live.title}
          aria-live="polite"
          className="fixed inset-x-4 top-[88px] overflow-hidden rounded-card border border-hair bg-surface/95 p-4 pr-3 shadow-[0_20px_60px_rgba(0,0,0,.6)] md:inset-x-auto md:bottom-6 md:left-6 md:top-auto md:w-[360px]"
          style={{ zIndex: Z.nav }}
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          // Its own timing: the entrance's delay would otherwise hold a dismissed toast on screen.
          exit={{ opacity: 0, y: 16, scale: 0.97, transition: reduce ? { duration: 0 } : { duration: 0.2 } }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 26, delay: 0.6 }}
        >
          <span aria-hidden="true" className="absolute inset-x-[10%] top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GLOW.green}, transparent)` }} />
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="label flex items-center gap-2.5 !text-text">
                <motion.span
                  aria-hidden="true"
                  className="inline-block size-2 shrink-0 rounded-full bg-green"
                  style={{ boxShadow: `0 0 10px 2px ${GLOW.green}80` }}
                  animate={{ opacity: [1, 0.35, 1] }}
                  transition={reduce ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                />
                {TICKET_SALE.live.title}
              </p>
              <p className="mt-2 text-[14px] leading-snug text-muted">{TICKET_SALE.live.line}</p>
              <Button href="#tickets" size="sm" className="mt-3" onClick={dismiss}>
                {TICKET_SALE.live.cta}
              </Button>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="grid size-9 shrink-0 place-items-center rounded-pill text-muted transition-colors hover:bg-white/10 hover:text-text"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
