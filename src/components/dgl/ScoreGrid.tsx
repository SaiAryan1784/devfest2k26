"use client";

import { useRef } from "react";
import { m, useReducedMotion } from "motion/react";
import { DGL } from "@/data/dgl";
import { gridKey } from "@/lib/dgl/audience-view";
import { cn } from "@/lib/utils";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

type Props = {
  value: number | null;
  onChange(n: number): void;
  disabled?: boolean;
  /** Id of the visible heading that names the group; without it the group is named by DGL.copy.votingTitle. */
  labelledBy?: string;
};

/**
 * Ten score cells, 1 to 10, in a 5 x 2 grid: a radio group, so picking is
 * separate from committing (the caller's own "Lock in" button). Cells are
 * neutral on purpose (a red-to-green scale would push votes); the picked one
 * is the primary-button white and scales to 1.04.
 *
 * Keyboard: one tab stop (the picked cell, or 1), arrows move and pick
 * (left and right wrap, up and down switch rows), Home and End jump, Space
 * and Enter pick the focused cell. Presentational: the audience page, the
 * admin's own-score entry and the kiosk all use it.
 */
export function ScoreGrid({ value, onChange, disabled = false, labelledBy }: Props) {
  const reduce = useReducedMotion();
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const tabStop = value ?? 1;

  const onKeyDown = (n: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const next = gridKey(n, e.key);
    if (next === null) return;
    e.preventDefault();
    onChange(next);
    cells.current[next - 1]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : DGL.copy.votingTitle}
      aria-disabled={disabled || undefined}
      className="grid grid-cols-5 gap-2"
    >
      {SCORES.map((n) => {
        const picked = value === n;
        return (
          <m.button
            key={n}
            ref={(el) => {
              cells.current[n - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={picked}
            tabIndex={n === tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(n)}
            onKeyDown={onKeyDown(n)}
            initial={false}
            animate={{ scale: picked ? 1.04 : 1 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 }}
            className={cn(
              // rounded-pill! because the global :focus-visible rule sets a 6 px radius and is unlayered.
              "h-14 min-w-11 cursor-pointer rounded-pill! font-mono text-[20px] font-medium tabular-nums transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50",
              picked ? "bg-text text-[#0a0a0c]" : "glass-pill text-text",
            )}
          >
            {n}
          </m.button>
        );
      })}
    </div>
  );
}
