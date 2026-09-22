"use client";

import { useEffect, useState } from "react";
import SplitFlapText from "@/components/reactbits/SplitFlapText";
import { countdownTo } from "@/lib/countdown";
import { cn } from "@/lib/utils";

export type CountdownUnit = "days" | "hours" | "minutes" | "seconds";

const LABELS: Record<CountdownUnit, string> = { days: "Days", hours: "Hours", minutes: "Minutes", seconds: "Seconds" };
const SHORT: Record<CountdownUnit, string> = { days: "d", hours: "h", minutes: "m", seconds: "s" };

type Props = {
  /** ISO target, always from src/data/*. */
  to: string;
  /** Read out to assistive tech, e.g. "Early bird sale ends in". The tiles/digits are decorative. */
  label: string;
  /** "flap" = split-flap tiles, a section's own anchor. "inline" = one mono line, for a facts row. */
  variant?: "flap" | "inline";
  units?: CountdownUnit[];
  size?: "lg" | "sm";
  /** Days pad to 3 so the width never changes as it counts down; a sale measured in single-digit days can use 2. */
  padDays?: 2 | 3;
  /** Ticks only while true. Pass a useInView result so an off-screen countdown costs nothing. */
  active?: boolean;
  className?: string;
};

/**
 * One countdown, wherever the page needs one: the tickets sale strip and the
 * hero's facts row today. Extracted from the countdown that used to be
 * private to the (now removed) essentials section.
 *
 * The value is null on the server and on the first client render, because
 * time remaining depends on the reader's own clock and can never be in the
 * HTML; the zero placeholder is padded to the same character width as the
 * real value (a mono face), so filling it in shifts nothing.
 */
export function Countdown({
  to,
  label,
  variant = "flap",
  units = ["days", "hours", "minutes"],
  size = "lg",
  padDays = 3,
  active = true,
  className,
}: Props) {
  const [c, setC] = useState<ReturnType<typeof countdownTo> | null>(null);
  const live = units.includes("seconds");

  useEffect(() => {
    if (!active) return;
    const tick = () => setC(countdownTo(to));
    tick();
    const t = setInterval(tick, live ? 1_000 : 30_000);
    return () => clearInterval(t);
  }, [to, active, live]);

  const width = (u: CountdownUnit) => (u === "days" ? padDays : 2);
  const value = (u: CountdownUnit) => (c ? String(c[u]).padStart(width(u), "0") : "0".repeat(width(u)));
  const spoken = c ? units.map((u) => `${c[u]} ${LABELS[u].toLowerCase()}`).join(", ") : "counting";

  if (variant === "inline") {
    return (
      <span className={cn("label inline-flex items-baseline gap-2 !text-text", className)}>
        <span className="sr-only">{`${label}: ${spoken}`}</span>
        <span aria-hidden="true" className="inline-flex items-baseline gap-2">
          {units.map((u) => (
            <span key={u}>
              {value(u)}
              <span className="text-muted">{SHORT[u]}</span>
            </span>
          ))}
        </span>
      </span>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-end", size === "lg" ? "gap-x-10 gap-y-6" : "gap-x-6 gap-y-4", className)}>
      <p className="sr-only">{`${label}: ${spoken}`}</p>
      {units.map((u) => (
        // aria-hidden on the tiles: the sentence above already says it, and
        // this keeps SplitFlapText's non-standard role="text" out of the tree.
        <div key={u} aria-hidden="true">
          <SplitFlapText
            text={value(u)}
            charset="numeric"
            padTo={width(u)}
            loop={false}
            tileColor="#121216"
            textColor="#f5f5f7"
            tileRadius={size === "lg" ? 8 : 6}
            gap={size === "lg" ? 5 : 4}
            fontSize={size === "lg" ? "clamp(2.2rem, 5.5vw, 4rem)" : "clamp(1.4rem, 3.2vw, 2rem)"}
          />
          <p className={cn("label", size === "lg" ? "mt-3" : "mt-2 !text-[11px]")}>{LABELS[u]}</p>
        </div>
      ))}
    </div>
  );
}
