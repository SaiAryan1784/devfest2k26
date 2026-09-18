"use client";

import { useState } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { Lockup, PILL } from "@/components/brand/Lockup";
import PillNav from "@/components/reactbits/PillNav";
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

/**
 * Lockup plus ReactBits' PillNav (GSAP: a circle fills each pill from the
 * bottom while the label swaps). The header keeps its own fixed positioning,
 * scroll-triggered glass and entrance; PillNav supplies the links, the
 * hamburger and the mobile popover.
 */
export function Nav() {
  const reduce = useReducedMotion();
  const accent = useAccent((s) => s.accent);
  const loaderDone = useLoaderState((s) => s.done);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 40));

  return (
    <motion.header
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 top-0 flex h-[84px] items-center justify-between px-5 transition-[background-color,backdrop-filter,border-color] duration-500 md:px-10 lg:px-14",
        scrolled ? "border-b border-hair bg-canvas/70 backdrop-blur-xl" : "border-b border-transparent",
      )}
      style={{ zIndex: Z.nav }}
      initial={{ y: -16, opacity: 0 }}
      animate={loaderDone ? { y: 0, opacity: 1 } : { y: -16, opacity: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
    >
      <PillNav
        logo={<Lockup pill={PILL[accent]} title={EVENT.name} />}
        logoHref="#top"
        logoAriaLabel={EVENT.name}
        items={LINKS}
        // The lockup already arrives with the header's own entrance; PillNav
        // scaling it up from zero on top of that read as a double animation.
        initialLoadAnimation={false}
        baseColor="#f5f5f7"
        pillColor="transparent"
        pillTextColor="#9a9aa3"
        hoveredPillTextColor="#0a0a0c"
        mobileFooter={
          <Button href={EVENT.links.waitlist} className="w-full">
            {EVENT.cta.primary}
          </Button>
        }
      />

      <Button href={EVENT.links.waitlist} size="sm" className="hidden sm:inline-flex">
        {EVENT.cta.primary}
      </Button>
    </motion.header>
  );
}
