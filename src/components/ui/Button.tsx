"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type Props = {
  /** Required unless `disabled`. */
  href?: string;
  variant?: "primary" | "ghost";
  size?: "md" | "sm";
  external?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  /** Renders a real disabled <button> (no href, no navigation) instead of a link, for a CTA that's temporarily off. */
  disabled?: boolean;
};

const MotionLink = motion.create(Link);

export function Button({ href, variant = "primary", size = "md", external, className, children, onClick, disabled }: Props) {
  const sized = size === "md" ? "h-12 px-6 text-[15px]" : "h-10 px-[18px] text-sm";

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className={cn(
          "inline-flex shrink-0 cursor-not-allowed items-center justify-center whitespace-nowrap rounded-pill border border-hair bg-white/5 font-medium text-muted",
          sized,
          className,
        )}
      >
        {children}
      </button>
    );
  }

  const isExternal = external ?? /^(https?:|mailto:)/.test(href!);
  return (
    <MotionLink
      href={href}
      onClick={onClick}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener" : undefined}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-pill font-medium transition-colors duration-300",
        sized,
        variant === "primary" && "bg-text text-[#0a0a0c] hover:bg-white",
        variant === "ghost" && "glass-pill text-text [text-shadow:0_1px_12px_rgba(0,0,0,.6)] hover:bg-white/10",
        className,
      )}
    >
      {children}
      {isExternal && <span className="sr-only"> (opens in new tab)</span>}
    </MotionLink>
  );
}
