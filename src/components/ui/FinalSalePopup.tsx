"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { useIsPast } from "@/components/ui/Countdown";
import { FINAL_SALE, TICKET_SALE } from "@/data/tickets";
import { useLoaderState } from "@/lib/loader-state";
import { Z } from "@/lib/z";

// Keyed on the sale time, so moving the date shows it again to everyone.
const SEEN_KEY = `devfest-final-sale-seen-${TICKET_SALE.opensAt}`;

/**
 * "This is the final sale, be ready": a centred pop-up for everyone who opens
 * the site before the sale starts, once per visitor (until the sale date
 * changes). Once tickets are live the corner pop-up (EarlyBirdToast) takes
 * over, so this never shows after the sale opens.
 */
export function FinalSalePopup() {
  const reduce = useReducedMotion();
  const loaderDone = useLoaderState((s) => s.done);
  const past = useIsPast(TICKET_SALE.opensAt); // null until mounted
  // Hidden on the server and first paint; corrected from localStorage after mount.
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeen(localStorage.getItem(SEEN_KEY) === "1");
  }, []);

  const close = () => {
    localStorage.setItem(SEEN_KEY, "1");
    setSeen(true);
  };

  useEffect(() => {
    if (seen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seen]);

  const show = past === false && loaderDone && !seen;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 grid place-items-center px-5"
          style={{ zIndex: Z.overlay }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={reduce ? { duration: 0 } : { duration: 0.4, delay: 0.8 }}
        >
          <div aria-hidden="true" className="absolute inset-0 bg-canvas/80" onClick={close} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="final-sale-title"
            className="relative w-full max-w-[460px] rounded-panel border border-hair bg-surface p-8 text-center shadow-[0_30px_90px_rgba(0,0,0,.7)] md:p-10"
            initial={{ y: 24, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 26, delay: 0.8 }}
          >
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute right-3 top-3 grid size-10 place-items-center rounded-pill text-muted transition-colors hover:bg-white/10 hover:text-text"
            >
              <X aria-hidden="true" size={18} />
            </button>
            <h2 id="final-sale-title" className="display text-[clamp(1.9rem,5vw,2.6rem)] font-semibold leading-[1.05]">
              {FINAL_SALE.title}
            </h2>
            <p className="mx-auto mt-4 max-w-[34ch] text-[16px] leading-relaxed text-muted">{FINAL_SALE.line}</p>
            <p className="label mt-6 !text-text">Opens {TICKET_SALE.opensLabel}</p>
            <Button href="#tickets" onClick={close} className="mt-7 w-full">
              {FINAL_SALE.cta}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
