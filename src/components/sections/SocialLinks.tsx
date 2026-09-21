"use client";

import { InstagramLogo, LinkedinLogo, XLogo, YoutubeLogo } from "@phosphor-icons/react/dist/ssr";
import { motion, useReducedMotion } from "motion/react";
import ClickSpark from "@/components/reactbits/ClickSpark";
import Magnet from "@/components/reactbits/Magnet";
import { EVENT } from "@/data/event";

const SOCIALS = [
  { href: EVENT.socials.instagram, label: "Instagram", Icon: InstagramLogo },
  { href: EVENT.socials.linkedin, label: "LinkedIn", Icon: LinkedinLogo },
  { href: EVENT.socials.youtube, label: "YouTube", Icon: YoutubeLogo },
  { href: EVENT.socials.x, label: "X", Icon: XLogo },
];

/**
 * The footer's four icons: a magnetic pull on hover (the same `Magnet` the
 * hero's CTAs use), a spark burst on click (the same `ClickSpark` the final
 * CTA's button uses, radius tuned down from its 44px button size to a 44px
 * circular icon so the burst doesn't clip), a small scale on both. Colour
 * stays on the plain Tailwind hover classes; only the physical motion is
 * Motion/ReactBits.
 */
export function SocialLinks() {
  const reduce = useReducedMotion();

  return (
    <ul className="flex gap-2" aria-label="Social links">
      {SOCIALS.map(({ href, label, Icon }) => (
        <li key={label}>
          <Magnet padding={40} magnetStrength={5} disabled={!!reduce}>
            <ClickSpark sparkColor="#fff" sparkSize={6} sparkRadius={14} sparkCount={8} duration={400}>
              <motion.a
                href={href}
                target="_blank"
                rel="noopener"
                aria-label={`${label} (opens in new tab)`}
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="glass-pill grid size-11 place-items-center rounded-pill text-text transition-colors hover:bg-white/10"
              >
                <Icon size={20} />
              </motion.a>
            </ClickSpark>
          </Magnet>
        </li>
      ))}
    </ul>
  );
}
