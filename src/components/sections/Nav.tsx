"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { List, X } from "@phosphor-icons/react";
import { Lockup, PILL } from "@/components/brand/Lockup";
import { Button } from "@/components/ui/Button";
import { EVENT } from "@/data/event";
import { useAccent } from "@/lib/accent";
import { useLoaderState } from "@/lib/loader-state";
import { Z } from "@/lib/z";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#tracks", label: "Tracks" },
  { href: "#floor", label: "The floor" },
  { href: "#speakers", label: "Speakers" },
  { href: "#schedule", label: "Schedule" },
  { href: "#venue", label: "Venue" },
  { href: "#partners", label: "Partners" },
];

export function Nav() {
  const reduce = useReducedMotion();
  const accent = useAccent((s) => s.accent);
  const loaderDone = useLoaderState((s) => s.done);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 40));

  return (
    <>
      <motion.header
        aria-label="Primary"
        className={cn(
          "fixed inset-x-0 top-0 flex h-[72px] items-center justify-between px-5 transition-[background-color,backdrop-filter,border-color] duration-500 md:px-10 lg:px-14",
          scrolled ? "border-b border-hair bg-canvas/70 backdrop-blur-xl" : "border-b border-transparent",
        )}
        style={{ zIndex: Z.nav }}
        initial={{ y: -16, opacity: 0 }}
        animate={loaderDone ? { y: 0, opacity: 1 } : { y: -16, opacity: 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      >
        <Link href="#top" aria-label={EVENT.name} className="block w-[104px] py-3">
          <Lockup pill={PILL[accent]} />
        </Link>

        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="flex items-center gap-7 text-sm font-medium text-muted">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="inline-block py-3 transition-colors hover:text-text">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Button href={EVENT.links.waitlist} size="sm" className="hidden sm:inline-flex">
            {EVENT.cta.primary}
          </Button>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            className="glass grid size-11 place-items-center rounded-pill lg:hidden"
          >
            {open ? <X size={20} /> : <List size={20} />}
          </button>
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            className="fixed inset-0 flex flex-col justify-end bg-canvas/80 p-5 pt-24 backdrop-blur-2xl lg:hidden"
            style={{ zIndex: Z.nav - 1 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.ul
              className="mb-8 flex flex-col"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.05 } } }}
            >
              {LINKS.map((l) => (
                <motion.li key={l.href} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
                  <a href={l.href} onClick={() => setOpen(false)} className="display block border-b border-hair py-4 text-3xl font-medium">
                    {l.label}
                  </a>
                </motion.li>
              ))}
            </motion.ul>
            <Button href={EVENT.links.waitlist} className="w-full">
              {EVENT.cta.primary}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
