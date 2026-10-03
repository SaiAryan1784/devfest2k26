import { DGL } from "@/data/dgl";
import { formatClock, isFinalCountdown } from "./audience-view";

/**
 * The stage's big act timer, decided. Pure: no React, no DOM. The phone's
 * small clock and the stage's big one share one formatter, so they never
 * disagree about what second it is.
 */

export { formatClock };

export type TimerTone = "calm" | "final" | "critical";

/**
 * Calm, then final in the last DGL.finalCountdownS seconds, then critical in
 * the last DGL.criticalCountdownS. Inclusive at both thresholds, which with
 * formatClock's round-up means the colour changes on the same frame the
 * digits turn 0:10 and 0:03.
 */
export function timerTone(ms: number): TimerTone {
  if (ms <= DGL.criticalCountdownS * 1000) return "critical";
  if (isFinalCountdown(ms)) return "final";
  return "calm";
}

/** What the big timer reads: M:SS while time is left, the time copy once it is up. */
export function clockText(ms: number): string {
  return ms <= 0 ? DGL.copy.stageTime : formatClock(ms);
}

/** The ring behind the timer, in the spectrum colour of its tone. */
export const RING_COLOR = { calm: "blue", final: "yellow", critical: "red" } as const satisfies Record<TimerTone, "blue" | "yellow" | "red">;
