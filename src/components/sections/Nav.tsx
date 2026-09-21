"use client";

import { useState } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { Lockup, PILL } from "@/components/brand/Lockup";
import PillNav from "@/components/reactbits/PillNav";
import { Button } from "@/components/ui/Button";
import { EVENT } from "@/data/event";
import { useAccent } from "@/lib/accent";
import { useActiveSection } from "@/lib/use-active-section";
import { useHeroView } from "@/lib/hero-view";
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
  { href: "#gallery", label: "Gallery" },
];

// Stable reference: the hook observes these ids once.
const SECTION_IDS = LINKS.map((l) => l.href.slice(1));

/**
 * Lockup left, ReactBits PillNav centred on the viewport (GSAP: a circle
 * fills each pill from the bottom while the label swaps), hamburger right on
 * mobile. The header keeps its own fixed positioning, scroll-triggered glass
 * and entrance; PillNav supplies the links and the mobile popover.
 *
 * The three-column grid is what centres the pills on the *viewport* rather
 * than on the space left beside the lockup. PillNav's own wrappers are
 * `display: contents` (see PillNav.css) so the pill bar and the hamburger
 * land in their own columns.
 */
export function Nav() {
  const reduce = useReducedMotion();
  const accent = useAccent((s) => s.accent);
  const loaderDone = useLoaderState((s) => s.done);
  const heroInView = useHeroView((s) => s.inView);
  const activeId = useActiveSection(SECTION_IDS);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 40));

  return (
    <motion.header
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 top-0 grid h-[76px] grid-cols-[1fr_auto_1fr] items-center px-5 transition-[background-color,backdrop-filter,border-color] duration-500 md:px-10 lg:px-14",
        // No backdrop blur while the billboard's video is under the nav: blurring a moving picture every frame is the one thing a weak GPU cannot afford.
        scrolled ? (heroInView ? "border-b border-hair bg-canvas/85" : "border-b border-hair bg-canvas/70 backdrop-blur-xl") : "border-b border-transparent",
      )}
      style={{ zIndex: Z.nav }}
      initial={{ y: -16, opacity: 0 }}
      animate={loaderDone ? { y: 0, opacity: 1 } : { y: -16, opacity: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
    >
      <a href="#top" aria-label={EVENT.name} className="col-start-1 block w-[140px] justify-self-start py-2 lg:w-[150px]">
        <Lockup pill={PILL[accent]} title={EVENT.name} />
      </a>

      <PillNav
        items={LINKS}
        activeHref={activeId ? `#${activeId}` : undefined}
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
    </motion.header>
  );
}
